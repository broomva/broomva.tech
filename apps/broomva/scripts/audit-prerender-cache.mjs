#!/usr/bin/env node
/**
 * Fail the build if anything secret reached the prerender cache.
 *
 * Why this exists: Vercel disclosed that its CDN briefly returned internal
 * prerender data — React postponed state and the route's Render Resume Data
 * Cache — to clients, for projects using Cache Components. `broomva-tech` was
 * named as affected. The RDC can hold complete `use cache` return values and
 * fetch response bodies captured during prerendering, so anything a cached
 * function returns must be treated as world-readable. See BRO-2189.
 *
 * This app sets `cacheComponents: true` (next.config.ts), so the invariant is
 * permanent, not incident-specific: **no secret may appear in build output.**
 *
 * Two passes:
 *   1. Raw prerender artifacts, byte-wise.
 *   2. Decoded postponed state and use-cache values, via the vendored
 *      vercel-labs decoder. This is the load-bearing pass — cached payloads are
 *      base64(deflate(JSON)) with `entry.value` base64 *again*, so a byte-wise
 *      search over `.next` structurally cannot see them.
 *
 * Two detectors:
 *   a. Exact values of this app's configured secrets. Never suppressible.
 *   b. Credential shapes, for secrets that arrived from somewhere other than
 *      the environment (a database row, an API response). Suppressible, since
 *      this site publishes prose containing example connection strings.
 *
 * It never prints a secret value — only the variable name and file path.
 *
 * Fails closed everywhere it cannot see: unreadable files, a decoder whose
 * output contract changed, `.meta` files it could not parse, or an env that
 * did not supply the app's critical secrets. A gate that reports success
 * because it was blind is worse than no gate.
 *
 * Usage:
 *   node scripts/audit-prerender-cache.mjs [pathToDotNext]
 *   node scripts/audit-prerender-cache.mjs --self-test
 */
import { mkdtemp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { deflateSync } from "node:zlib";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const ROOT = resolve(import.meta.dirname, "..");
const DECODER = join(import.meta.dirname, "vendor", "ppr-rdc-inspect.mjs");

/** Decoding a pathological cache must not hang or OOM a production build. */
const DECODER_TIMEOUT_MS = 120_000;
const DECODER_MAX_BUFFER = 256 * 1024 * 1024;

/**
 * Env vars whose values are public by construction. Keyed by NAME — never by
 * value shape, because "looks harmless" is how a real secret gets waved
 * through.
 */
const PUBLIC_ENV_KEYS = new Set([
  "APP_URL",
  "NODE_ENV",
  "SENTRY_ORG",
  "SENTRY_PROJECT",
  "VERCEL_ENV",
  "VERCEL_URL",
  "VERCEL_BRANCH_URL",
  "VERCEL_GIT_COMMIT_REF",
  "VERCEL_GIT_COMMIT_SHA",
  "VERCEL_PROJECT_PRODUCTION_URL",
]);

/**
 * Secrets without which a "PASS" is meaningless. Asserting on specific keys
 * beats a count: eight credential-shaped variables inherited from the build
 * host satisfy a numeric floor while proving nothing about *this app's* env.
 */
const REQUIRED_SECRETS = ["DATABASE_URL", "AUTH_SECRET"];

const MIN_SECRET_LENGTH = 12;

/**
 * Credential-shaped key names, used to find secrets in `process.env` on build
 * hosts where `.env.local` does not exist. Matching on the NAME keeps `HOME`,
 * `PWD`, and `PATH` out — those are filesystem paths the decoder prints in its
 * own section headers, and sweeping the whole environment matched them every
 * time.
 *
 * This list is a safety net, not the primary source: the app's own
 * `lib/env-schema.ts` is authoritative. `LIFEGW_TIER1_SIGNING_JWK` — a private
 * signing key — matches nothing here and appears in no `.env*` file, so a
 * name heuristic alone left it entirely uncovered.
 */
const SECRET_NAME_PATTERN =
  /(^|_)(KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIALS?|DSN|API|AUTH|JWK|JWT|SALT|SEED|SIGNING|PRIVATE|PASSPHRASE|CERT|COOKIE|SESSION)(_|$)|_URL$|^DATABASE_URL/;

/** Credential shapes, independent of what this environment happens to hold. */
const CREDENTIAL_PATTERNS = [
  ["OpenAI/Anthropic-style key", /\bsk-(?:ant-)?[A-Za-z0-9_-]{20,}/g],
  ["GitHub token", /\b(?:gh[pousr]_|github_pat_)[A-Za-z0-9_]{20,}/g],
  ["Google API key", /\bAIza[0-9A-Za-z_-]{30,}/g],
  ["SendGrid key", /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/g],
  ["npm token", /\bnpm_[A-Za-z0-9]{30,}/g],
  // Only with userinfo — a credential-free connection string is a hostname.
  ["SQL URI with credentials", /\b(?:postgres(?:ql)?|mysql):\/\/[^\s"'<>/]+:[^\s"'<>@]+@[^\s"'<>]+/g],
  ["Redis URI with credentials", /\brediss?:\/\/[^\s"'<>:]+:[^\s"'<>@]+@[^\s"'<>]+/g],
  ["JSON Web Token", /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g],
  ["Bearer credential", /Bearer\s+[A-Za-z0-9._-]{20,}/g],
  ["Vercel Blob RW token", /vercel_blob_rw_[A-Za-z0-9_]+/g],
  ["PEM private key body", /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]{40,}?-----END/g],
  ["Slack/Stripe live key", /\b(?:xox[baprs]-[A-Za-z0-9-]{10,}|[sr]k_live_[A-Za-z0-9]{20,})/g],
];

/**
 * Prerender/cache artifacts only. Deliberately excludes `.js` bundles: those
 * carry third-party library text (a syntax-highlighting grammar contains
 * `postgres://…`, a key-parsing lib contains a PEM header), and flagging them
 * trains everyone to ignore this gate. Secrets reaching a *client* bundle is a
 * real but separate failure — `NEXT_PUBLIC_` misuse — and needs its own check.
 */
const SCANNABLE = new Set([".rsc", ".meta", ".segments", ".html", ".body"]);

/**
 * A URL with no embedded credentials is an endpoint, not a secret, and
 * endpoints belong in pages. `VERCEL_BRANCH_URL` is the preview deployment
 * host; it appears in canonical links and OG tags on every prerendered page,
 * and treating every `*_URL` as secret failed a real deploy on ~200 files.
 *
 * The rule is about the value, not the name — naming the offender would just
 * defer the problem to the next platform variable. Vercel injects these
 * protocol-less, so a bare host is parsed too.
 */
function isCredentialFreeUrl(key, value) {
  if (!/_URL$/.test(key)) return false;
  if (/(^|_)(KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIALS?)(_|$)/.test(key)) {
    return false;
  }
  for (const candidate of [value, `https://${value}`]) {
    try {
      const parsed = new URL(candidate);
      if (parsed.username !== "" || parsed.password !== "") return false;
      if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(parsed.hostname)) return true;
    } catch {
      // try the next candidate
    }
  }
  return false;
}

/**
 * Illustrative credentials, not real ones. This site publishes writing about
 * infrastructure and that prose is cached, so `postgres://user:password@
 * localhost:5432/db` in a code fence must not fail a production deploy.
 *
 * Tested against the *credential itself* after trimming any markup the regex
 * swallowed. An earlier version tested the raw match against `<[^>]+>`, which
 * meant a genuine credential followed by `</code>` in rendered HTML was
 * silently discarded — the filter suppressing exactly what it exists to catch.
 */
const PLACEHOLDER_MARKERS =
  /(^|[/:@])(localhost|127\.0\.0\.1|0\.0\.0\.0)([:/]|$)|example\.(com|org|net)|\byour[-_]?|user:pass(word)?@|:password@|USERNAME|PLACEHOLDER|changeme|xxxxx|AKIAIOSFODNN7EXAMPLE|\$\{|<[a-z_]+>/i;

function trimMarkup(match) {
  // Strip anything from the first markup/entity boundary onward, plus trailing
  // punctuation, so suppression is judged on the credential and nothing else.
  return match
    .split(/[<>"'\s]|&[a-z]+;/)[0]
    .replace(/[.,;:)\]}]+$/, "");
}

function isIllustrative(match, allowlist) {
  const credential = trimMarkup(match);
  if (allowlist.has(credential) || allowlist.has(match.trim())) return true;
  return PLACEHOLDER_MARKERS.test(credential);
}

function findSecrets(haystack, secrets, label, findings, allowlist = new Set()) {
  // Exact: a real configured secret. No suppression path — if one of these is
  // in the cache it is public, full stop.
  for (const [key, value] of secrets) {
    if (haystack.includes(value)) {
      findings.push(`${key} (env secret) found in ${label}`);
    }
  }
  // Heuristic: credentials that never passed through this environment.
  for (const [name, pattern] of CREDENTIAL_PATTERNS) {
    pattern.lastIndex = 0;
    const matches = (haystack.match(pattern) ?? []).filter(
      (m) => !isIllustrative(m, allowlist),
    );
    if (matches.length > 0) {
      findings.push(`${name} — ${matches.length} match(es) in ${label}`);
    }
  }
}

/** Key names the app itself declares. The authoritative source. */
async function keysFromEnvSchema(appDir) {
  const keys = new Set();
  const source = await readFile(join(appDir, "lib", "env-schema.ts"), "utf8").catch(
    () => "",
  );
  for (const match of source.matchAll(/^\s{2}([A-Z][A-Z0-9_]*)\s*:/gm)) {
    keys.add(match[1]);
  }
  return keys;
}

async function secretsFromEnv(appDir) {
  const declared = new Set();
  const fallback = new Map();

  for (const name of [
    ".env.example",
    ".env",
    ".env.local",
    ".env.production",
    ".env.production.local",
  ]) {
    const text = await readFile(join(appDir, name), "utf8").catch(() => "");
    for (const line of text.split("\n")) {
      const trimmed = line.trim().replace(/^export\s+/, "");
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const key = trimmed.slice(0, trimmed.indexOf("=")).trim();
      if (!/^[A-Z][A-Z0-9_]*$/.test(key)) continue;
      declared.add(key);
      const value = trimmed.slice(trimmed.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
      if (value) fallback.set(key, value);
    }
  }

  for (const key of await keysFromEnvSchema(appDir)) declared.add(key);
  for (const key of Object.keys(process.env)) {
    if (SECRET_NAME_PATTERN.test(key)) declared.add(key);
  }

  const secrets = new Map();
  for (const key of declared) {
    if (key.startsWith("NEXT_PUBLIC_") || PUBLIC_ENV_KEYS.has(key)) continue;
    const value = process.env[key] ?? fallback.get(key);
    if (!value || value.length < MIN_SECRET_LENGTH) continue;
    // A placeholder committed in .env.example is not worth searching for. Only
    // ever applied to the file fallback — a value actually present in the
    // environment is real config and is always searched for, however odd it
    // looks.
    if (!process.env[key] && /^(your|example|changeme|placeholder|xxx|<)/i.test(value)) {
      continue;
    }
    if (isCredentialFreeUrl(key, value)) continue;
    // A filesystem path is not a credential. The decoder prints absolute paths
    // in its own section headers, so any path-valued variable matches there for
    // reasons that have nothing to do with the cache.
    if (value.startsWith("/") || /^[A-Za-z]:\\/.test(value)) continue;
    secrets.set(key, value);
  }
  return secrets;
}

async function* walk(dir, errors) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error.code !== "ENOENT") errors.push(`readdir ${dir}: ${error.message}`);
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full, errors);
    } else if (entry.isFile()) {
      const dot = entry.name.lastIndexOf(".");
      if (SCANNABLE.has(dot === -1 ? "" : entry.name.slice(dot))) yield full;
    }
  }
}

async function decodePrerenderData(nextDir) {
  const { stdout, stderr } = await execFileAsync(process.execPath, [DECODER, nextDir], {
    maxBuffer: DECODER_MAX_BUFFER,
    timeout: DECODER_TIMEOUT_MS,
  });
  return { stdout, stats: assertDecoderContract(stdout, stderr) };
}

/**
 * The decoder is the only thing that can see cached payloads, so its silence
 * must never be mistaken for a clean result. Fail closed on anything that
 * means "I could not look".
 */
function assertDecoderContract(stdout, stderr) {
  const summary =
    /Scanned (\d+) \.meta files; decoded (\d+) postponed states, (\d+) use-cache values, and (\d+) fetch-cache bodies; skipped (\d+) non-JSON \.meta files\./.exec(
      stderr,
    );
  if (!summary) {
    throw new Error(
      "Decoder did not print its expected summary line — its output format changed, " +
        "so this gate cannot prove it inspected anything. Re-vendor " +
        "scripts/vendor/ppr-rdc-inspect.mjs and re-check the markers.",
    );
  }
  const [, metaFiles, postponed, useCache, fetchBodies, skipped] = summary.map(Number);
  if (metaFiles === 0) {
    throw new Error(
      "Decoder found 0 .meta files — the build output is missing or the path is " +
        "wrong. Refusing to report a pass on an empty scan.",
    );
  }
  if (postponed > 0 && !stdout.includes("REACT POSTPONED STATE")) {
    throw new Error(
      "Decoder reported postponed states but emitted no section for them. " +
        "Refusing to pass on output this gate cannot parse.",
    );
  }
  return { metaFiles, postponed, useCache, fetchBodies, skipped };
}

async function loadAllowlist() {
  const path = join(import.meta.dirname, "prerender-cache-allowlist.json");
  const raw = await readFile(path, "utf8").catch(() => null);
  if (raw === null) return new Set();
  return new Set(JSON.parse(raw).allow ?? []);
}

/**
 * Build a real `.meta` carrying a secret at the bottom of the full encoding
 * chain, run the actual decoder over it, and assert the gate catches it.
 *
 * This exists because the manual version of this proof took four attempts, and
 * the first three were no-op plants that would each have been reported as
 * "gate passed". Asserting the plant is invisible to the raw scan is what
 * proves the decode pass is load-bearing rather than decoration.
 */
async function encodingChainProof() {
  const secret = "postgres://svc_selftest:a1b2c3d4e5f6@db-selftest.internal:5432/appdb";
  const dir = await mkdtemp(join(tmpdir(), "prerender-audit-"));
  try {
    const appDir = join(dir, "app");
    await mkdir(join(appDir, ".next", "server", "app"), { recursive: true });

    const postponed = JSON.stringify([1, { nextSegmentId: 1 }]);
    const rdc = {
      store: {
        fetch: {},
        cache: {
          '["selftest","abc",[]]': {
            entry: {
              // The payload is base64 *inside* the deflated JSON — the layer
              // that makes a raw grep return a false all-clear.
              value: Buffer.from(`1:{"leaked":"${secret}"}`).toString("base64"),
              tags: [],
            },
          },
        },
        encryptedBoundArgs: {},
      },
    };
    const encoded = deflateSync(Buffer.from(JSON.stringify(rdc))).toString("base64");
    const metaPath = join(appDir, ".next", "server", "app", "selftest.meta");
    await writeFile(
      metaPath,
      JSON.stringify({
        status: 200,
        headers: {},
        postponed: `${postponed.length}:${postponed}${encoded}`,
      }),
    );

    const raw = await readFile(metaPath, "utf8");
    if (raw.includes(secret)) {
      throw new Error(
        "self-test fixture invalid: the secret is visible in the raw bytes, so " +
          "this would not prove the decode pass does anything",
      );
    }

    const secrets = new Map([["SELFTEST_DATABASE_URL", secret]]);
    const { stdout, stats } = await decodePrerenderData(join(appDir, ".next"));
    if (stats.useCache < 1) {
      throw new Error(
        `self-test decoded ${stats.useCache} use-cache values from its own fixture — ` +
          "the decoder cannot read the format this gate depends on",
      );
    }
    const findings = [];
    findSecrets(stdout, secrets, "self-test fixture", findings);
    if (!findings.some((f) => f.startsWith("SELFTEST_DATABASE_URL"))) {
      throw new Error(
        "self-test FAILED — a real secret at the bottom of the encoding chain was " +
          "NOT detected. The decode pass is not working.",
      );
    }
    return true;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function selfTest() {
  console.log("self-test: proving the scanner can actually fail…");

  const secrets = new Map([["SYNTHETIC_TEST_SECRET", "s3cr3t-value-not-real-abcdef"]]);
  const planted =
    'cached: {"token":"s3cr3t-value-not-real-abcdef"} ' +
    "postgres://svc:9f3ad81c@db.internal:5432/app " +
    "ghp_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  const findings = [];
  findSecrets(planted, secrets, "synthetic fixture", findings);
  const expected = ["SYNTHETIC_TEST_SECRET", "SQL URI with credentials", "GitHub token"];
  const missing = expected.filter((e) => !findings.some((f) => f.includes(e)));
  if (missing.length > 0) {
    console.error(`self-test FAILED — detectors did not fire: ${missing.join(", ")}`);
    process.exit(1);
  }

  const clean = [];
  findSecrets('{"published":true,"title":"A public note"}', secrets, "clean", clean);
  if (clean.length > 0) {
    console.error(`self-test FAILED — false positive on clean input: ${clean.join("; ")}`);
    process.exit(1);
  }

  // Illustrative credentials in published prose must not fail a deploy…
  const prose = [];
  findSecrets(
    "Set <code>postgres://user:password@localhost:5432/mydb</code> in your .env, " +
      "then export AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE and retry.",
    new Map(),
    "prose",
    prose,
  );
  if (prose.length > 0) {
    console.error(`self-test FAILED — example credentials flagged: ${prose.join("; ")}`);
    process.exit(1);
  }

  // …and a REAL credential must still be caught even when rendered HTML puts
  // markup right after it. This is the case the first filter got wrong.
  for (const [desc, sample] of [
    ["bare", "postgres://svc_prod:9f3ad81c7b2e@db-prod-01.internal:5432/appdb"],
    ["in markup", "<code>postgres://svc_prod:9f3ad81c7b2e@db-prod-01.internal:5432/appdb</code>"],
    ["json-escaped", '{"dsn":"postgres://svc_prod:9f3ad81c7b2e@db-prod-01.internal:5432/appdb"}'],
  ]) {
    const live = [];
    findSecrets(sample, new Map(), "live", live);
    if (live.length === 0) {
      console.error(`self-test FAILED — real credential (${desc}) was suppressed`);
      process.exit(1);
    }
  }

  const urlCases = [
    ["VERCEL_BRANCH_URL", "https://app-git-branch-team.vercel.app", true],
    ["VERCEL_BRANCH_URL", "app-git-branch-team.vercel.app", true],
    ["SOME_FUTURE_PLATFORM_URL", "preview-xyz.vercel.app", true],
    ["LAGO_URL", "https://lago.arcan.la", true],
    ["DATABASE_URL", "postgres://user:s3cret@db.host:5432/app", false],
    ["REDIS_URL", "redis://default:pw123456@redis.host:6379", false],
    ["KV_REST_API_TOKEN", "https://not-really-a-url-token-value", false],
  ];
  for (const [key, value, expectSkipped] of urlCases) {
    if (isCredentialFreeUrl(key, value) !== expectSkipped) {
      console.error(
        `self-test FAILED — ${key} should be ${expectSkipped ? "skipped" : "under test"}`,
      );
      process.exit(1);
    }
  }

  // Names that must be discovered, including the ones a pure name heuristic
  // missed until a reviewer pointed at them.
  for (const key of ["LIFEGW_TIER1_SIGNING_JWK", "IP_HASH_SALT", "AUTH_SECRET"]) {
    if (!SECRET_NAME_PATTERN.test(key)) {
      console.error(`self-test FAILED — ${key} is not recognised as a secret name`);
      process.exit(1);
    }
  }

  await encodingChainProof();

  console.log(
    "self-test PASSED — detectors fire; prose suppressed; real credentials caught " +
      "bare/in-markup/json-escaped; credential-free URLs skipped while DATABASE_URL " +
      "stays under test; and a secret at the bottom of the real encoding chain was " +
      "decoded and caught",
  );
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--self-test")) {
    await selfTest();
    return;
  }

  const nextDir = resolve(args[0] ?? join(ROOT, ".next"));
  try {
    if (!(await stat(nextDir)).isDirectory()) throw new Error("not a directory");
  } catch {
    console.error(`No build output at ${nextDir}. Run \`next build\` first.`);
    process.exit(1);
  }

  // Env files resolve next to the audited build, NOT next to this script —
  // those differ when the gate runs from a git worktree, and getting it wrong
  // silently shrinks coverage to whatever `.env.example` happens to declare.
  const appDir = dirname(nextDir);
  const secrets = await secretsFromEnv(appDir);
  const allowlist = await loadAllowlist();

  console.log(`Auditing prerender cache in ${nextDir}`);
  console.log(`  env declarations read from ${appDir}`);
  console.log(`  ${secrets.size} secret-bearing env var(s) under test`);

  const absent = REQUIRED_SECRETS.filter((key) => !secrets.has(key));
  if (absent.length > 0) {
    throw new Error(
      `Required secret(s) not resolved: ${absent.join(", ")}. The app's environment ` +
        "was not supplied, so the exact check would pass while barely looking. " +
        "A count-based floor cannot catch this — eight unrelated credential-shaped " +
        "variables from the build host would satisfy it.",
    );
  }
  if (allowlist.size > 0) console.log(`  ${allowlist.size} reviewed allowlist exception(s)`);

  const findings = [];
  const ioErrors = [];
  let scanned = 0;

  for (const dir of [join(nextDir, "server"), join(nextDir, "static")]) {
    for await (const file of walk(dir, ioErrors)) {
      const blob = await readFile(file, "utf8").catch((error) => {
        ioErrors.push(`read ${file}: ${error.message}`);
        return null;
      });
      if (blob === null) continue;
      scanned += 1;
      findSecrets(blob, secrets, file.replace(`${nextDir}/`, ""), findings, allowlist);
    }
  }
  console.log(`  scanned ${scanned} raw artifact(s)`);

  // Decode only `.next/server` — the deployed prerender surface. `.next/dev`
  // (local Turbopack dev cache) and `.next/cache` (build cache) hold binary
  // `.meta` files in unrelated formats that are neither deployed nor prerender
  // data; counting them would make the skipped-file check fail every run and
  // force it to be disabled.
  const serverDir = join(nextDir, "server");
  const { stdout: decoded, stats } = await decodePrerenderData(serverDir);
  console.log(
    `  decoded ${stats.postponed} postponed state(s), ${stats.useCache} use-cache ` +
      `value(s), ${stats.fetchBodies} fetch body(ies) from ${stats.metaFiles} .meta file(s)`,
  );
  // The decoder prefixes every section with the artifact's absolute path.
  // Those paths are not cache contents, and matching against them produced a
  // false positive for every env var whose value happens to appear in the build
  // directory's path. Neutralise them before scanning.
  const decodedPayload = decoded.split(serverDir).join("<server>");
  findSecrets(decodedPayload, secrets, "decoded prerender data", findings, allowlist);

  // An unreadable artifact is an unscanned artifact. Silence about it is the
  // same failure mode as a passing scan that searched nothing.
  if (ioErrors.length > 0) {
    console.error("\nFAIL — could not read part of the build output:\n");
    for (const error of ioErrors.slice(0, 20)) console.error(`  • ${error}`);
    process.exit(1);
  }
  if (stats.skipped > 0) {
    console.error(
      `\nFAIL — the decoder skipped ${stats.skipped} unparseable .meta file(s) under ` +
        `${serverDir}. Their cached values were never inspected, so this run cannot ` +
        "claim the cache is clean.",
    );
    process.exit(1);
  }

  if (findings.length > 0) {
    console.error("\nFAIL — secret material reached the prerender cache:\n");
    for (const finding of new Set(findings)) console.error(`  • ${finding}`);
    console.error(
      "\nAnything in the prerender cache must be treated as public. Remove it from " +
        "the cached path, then rotate the affected credential.",
    );
    process.exit(1);
  }

  console.log("\nPASS — no secret material in postponed state or use-cache values.");
}

main().catch((error) => {
  console.error(`audit-prerender-cache failed: ${error.message}`);
  process.exit(1);
});
