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
 * The one-time audit that cleared the incident is worthless a week later; this
 * turns it into a gate that runs on every build.
 *
 * What it scans:
 *   1. Raw `.next/server` + `.next/static` artifacts, byte-wise.
 *   2. Decoded postponed state and `use cache` values, via the vendored
 *      vercel-labs decoder. This second pass is the one that matters — RDC
 *      payloads can be deflate-compressed, so a plain grep over `.next`
 *      returns a false negative on exactly the data we care about.
 *
 * What it looks for:
 *   a. Real values of this environment's secrets (the precise check).
 *   b. Generic credential shapes (the check that still works when a secret
 *      arrives from somewhere other than the environment).
 *
 * It never prints a secret value — only the variable name and file path.
 *
 * Usage:
 *   node scripts/audit-prerender-cache.mjs [pathToDotNext]
 *   node scripts/audit-prerender-cache.mjs --self-test   # prove it can fail
 */
import { readdir, readFile, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const ROOT = resolve(import.meta.dirname, "..");
const DECODER = join(import.meta.dirname, "vendor", "ppr-rdc-inspect.mjs");

/**
 * Env vars whose values are public by construction, so a match is expected
 * rather than a finding. Keyed by name — never by value shape, because
 * "looks harmless" is how a real secret gets waved through.
 */
const PUBLIC_ENV_KEYS = new Set([
  "APP_URL",
  "NODE_ENV",
  "SENTRY_ORG",
  "SENTRY_PROJECT",
  "VERCEL_ENV",
  "VERCEL_URL",
  "VERCEL_GIT_COMMIT_REF",
  "VERCEL_GIT_COMMIT_SHA",
  "VERCEL_PROJECT_PRODUCTION_URL",
]);

/** Shortest env value worth searching for; below this, matches are noise. */
const MIN_SECRET_LENGTH = 12;

/**
 * Coverage floor. If almost nothing resolves, the env was not wired up and a
 * "PASS" would mean the gate barely looked. Fail closed rather than report a
 * hollow success. Kept low deliberately: locally all `.env*` files are present
 * (~49 resolve), but on Vercel only the committed `.env.example` ships and
 * values arrive via `process.env`, so the honest floor is "clearly more than
 * zero", not a number tuned to one machine.
 */
const MIN_SECRETS_UNDER_TEST = 8;

/**
 * Key-name shapes that denote credentials. Used to pick secrets out of
 * `process.env` on build hosts, where `.env.local` does not exist. Matching on
 * the NAME (never the value) is what keeps `HOME`, `PWD`, and `PATH` out —
 * those are the paths that produced false positives when this swept the whole
 * environment.
 */
const SECRET_NAME_PATTERN =
  /(^|_)(KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIALS?|DSN|API|AUTH)(_|$)|_URL$|^DATABASE_URL/;

/** Credential shapes, independent of what this environment happens to hold. */
const CREDENTIAL_PATTERNS = [
  ["OpenAI/Anthropic-style key", /\bsk-(ant-)?[A-Za-z0-9_-]{20,}/g],
  ["GitHub token", /\b(gh[pousr]_|github_pat_)[A-Za-z0-9_]{20,}/g],
  ["SQL connection URI", /\b(postgres(?:ql)?|mysql):\/\/[^\s"']{10,}/g],
  ["Redis URI with credentials", /\brediss?:\/\/[^\s"':]+:[^\s"'@]+@/g],
  ["AWS access key id", /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g],
  ["JSON Web Token", /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./g],
  ["Bearer credential", /Bearer\s+[A-Za-z0-9._-]{20,}/g],
  ["Vercel Blob RW token", /vercel_blob_rw_[A-Za-z0-9_]+/g],
  ["PEM private key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/g],
  ["Slack/Stripe live key", /\b(xox[baprs]-[A-Za-z0-9-]{10,}|[sr]k_live_[A-Za-z0-9]{20,})/g],
];

/**
 * Prerender/cache artifacts only. Deliberately excludes `.js` bundles: those
 * are third-party library text (a syntax-highlighting grammar legitimately
 * contains `postgres://…`, a key-parsing lib contains a PEM header), and
 * flagging them trains everyone to ignore this gate. Secrets reaching a
 * *client* bundle is a real but separate failure — that is `NEXT_PUBLIC_`
 * misuse, and belongs in its own check, not smuggled in here.
 */
const SCANNABLE = new Set([".rsc", ".meta", ".segments", ".html", ".body"]);

/**
 * Secrets are taken from the app's own `.env*` declarations, not from the
 * ambient shell. Sweeping `process.env` pulls in `HOME`, `PWD`, `ZDOTDIR` —
 * whose values are filesystem paths that appear in build output for entirely
 * innocent reasons, producing guaranteed false positives.
 *
 * Key names come from the `.env*` files (which are the app's contract about
 * what config exists); values prefer `process.env`, so CI-injected values are
 * what actually get searched for.
 */
async function secretsFromEnvFiles(appDir) {
  const declared = new Set();
  const fallback = new Map();

  for (const name of [".env.example", ".env", ".env.local"]) {
    const text = await readFile(join(appDir, name), "utf8").catch(() => "");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const key = trimmed.slice(0, trimmed.indexOf("=")).trim();
      if (!/^[A-Z][A-Z0-9_]*$/.test(key)) continue;
      declared.add(key);
      const raw = trimmed.slice(trimmed.indexOf("=") + 1).trim();
      const value = raw.replace(/^["']|["']$/g, "");
      if (value) fallback.set(key, value);
    }
  }

  // On a build host there is no `.env.local`, so also take credential-shaped
  // names straight from the environment. Without this the gate would silently
  // audit only whatever `.env.example` happens to list.
  for (const key of Object.keys(process.env)) {
    if (SECRET_NAME_PATTERN.test(key)) declared.add(key);
  }

  const secrets = new Map();
  for (const key of declared) {
    if (key.startsWith("NEXT_PUBLIC_") || PUBLIC_ENV_KEYS.has(key)) continue;
    const value = process.env[key] ?? fallback.get(key);
    if (!value || value.length < MIN_SECRET_LENGTH) continue;
    // A placeholder in .env.example is not a secret worth searching for.
    if (/^(your|example|changeme|placeholder|xxx|<)/i.test(value)) continue;
    secrets.set(key, value);
  }
  return secrets;
}

async function* walk(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (entry.isFile()) {
      const dot = entry.name.lastIndexOf(".");
      const ext = dot === -1 ? "" : entry.name.slice(dot);
      if (SCANNABLE.has(ext)) yield full;
    }
  }
}

/**
 * Run the vendored decoder and assert its output still looks like what we
 * expect. If upstream changes its markers, we must fail loudly — a decoder
 * that silently emits nothing would turn this gate into a rubber stamp that
 * passes precisely because it is blind.
 */
async function decodePrerenderData(nextDir) {
  const { stdout, stderr } = await execFileAsync(
    process.execPath,
    [DECODER, nextDir],
    { maxBuffer: 512 * 1024 * 1024 },
  );
  assertDecoderContract(stdout, stderr);
  return stdout;
}

function assertDecoderContract(stdout, stderr) {
  const summary = /Scanned (\d+) \.meta files; decoded (\d+) postponed states, (\d+) use-cache values/.exec(
    stderr,
  );
  if (!summary) {
    throw new Error(
      "Decoder did not print its expected summary line. Its output format " +
        "changed, so this gate can no longer prove it inspected anything. " +
        "Re-vendor scripts/vendor/ppr-rdc-inspect.mjs and re-check the markers.",
    );
  }
  const [, metaFiles, postponed, useCache] = summary.map(Number);
  if (metaFiles === 0) {
    throw new Error(
      "Decoder found 0 .meta files. Either the build output is missing or " +
        "the path is wrong — refusing to report a pass on an empty scan.",
    );
  }
  console.log(
    `  decoded ${postponed} postponed state(s) and ${useCache} use-cache ` +
      `value(s) from ${metaFiles} .meta file(s)`,
  );
  if (!stdout.includes("REACT POSTPONED STATE")) {
    throw new Error(
      "Decoder output contained no postponed-state section despite reporting " +
        "decoded states. Refusing to pass on output this gate cannot parse.",
    );
  }
}

/**
 * Illustrative credentials, not real ones. This site publishes writing about
 * infrastructure, and that prose is cached — a post containing
 * `postgres://user:password@localhost:5432/db` must not be able to fail a
 * production deploy. Applied only to the heuristic shape scan; the precise
 * env-value check is exact and never suppressed.
 */
const EXAMPLE_CREDENTIAL = /localhost|127\.0\.0\.1|example\.(com|org)|\byour[-_]|<[^>]+>|\$\{|:\s*password@|user:pass|USERNAME|PLACEHOLDER|changeme|xxxxx|AKIAIOSFODNN7EXAMPLE/i;

function isIllustrative(match, allowlist) {
  return EXAMPLE_CREDENTIAL.test(match) || allowlist.has(match.trim());
}

function findSecrets(haystack, secrets, label, findings, allowlist = new Set()) {
  // Exact check: a real configured secret. No suppression path — if one of
  // these is in the cache it is public, full stop.
  for (const [key, value] of secrets) {
    if (haystack.includes(value)) {
      findings.push(`${key} (env secret) found in ${label}`);
    }
  }
  // Heuristic check: catches credentials that arrived from somewhere other
  // than this environment, minus anything recognisably illustrative.
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

/**
 * Reviewed exceptions, committed so a waiver is visible in git history rather
 * than applied by quietly switching the gate off.
 */
async function loadAllowlist() {
  const path = join(import.meta.dirname, "prerender-cache-allowlist.json");
  const raw = await readFile(path, "utf8").catch(() => null);
  if (raw === null) return new Set();
  const parsed = JSON.parse(raw);
  return new Set(parsed.allow ?? []);
}

async function selfTest() {
  // A gate that has never failed has not been shown capable of failing.
  // Inject a synthetic secret and assert every detector fires on it.
  console.log("self-test: proving the scanner can actually fail…");
  const secrets = new Map([["SYNTHETIC_TEST_SECRET", "s3cr3t-value-not-real-abcdef"]]);
  const planted =
    'cached: {"token":"s3cr3t-value-not-real-abcdef"} ' +
    "postgres://user:pw@host:5432/db ghp_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  const findings = [];
  findSecrets(planted, secrets, "synthetic fixture", findings);

  const expected = ["SYNTHETIC_TEST_SECRET", "SQL connection URI", "GitHub token"];
  const missing = expected.filter((e) => !findings.some((f) => f.includes(e)));
  if (missing.length > 0) {
    console.error(`self-test FAILED — detectors did not fire: ${missing.join(", ")}`);
    process.exit(1);
  }

  // And the inverse: clean input must produce nothing, or the gate is a
  // detector that always says yes, which is equally useless.
  const clean = [];
  findSecrets('{"published":true,"title":"A public note"}', secrets, "clean fixture", clean);
  if (clean.length > 0) {
    console.error(`self-test FAILED — false positive on clean input: ${clean.join("; ")}`);
    process.exit(1);
  }

  // Illustrative credentials in published writing must not fail a deploy…
  const prose = [];
  findSecrets(
    'Set <code>postgres://user:password@localhost:5432/mydb</code> in your .env, ' +
      "then export AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE and retry.",
    new Map(),
    "prose fixture",
    prose,
  );
  if (prose.length > 0) {
    console.error(`self-test FAILED — example credentials in prose flagged: ${prose.join("; ")}`);
    process.exit(1);
  }

  // …but the suppression must not have blinded the detector to a live one.
  const live = [];
  findSecrets(
    "postgres://svc_prod:9f3ad81c7b2e@db-prod-01.internal:5432/appdb",
    new Map(),
    "live fixture",
    live,
  );
  if (live.length === 0) {
    console.error(
      "self-test FAILED — illustrative filter suppressed a real connection string",
    );
    process.exit(1);
  }

  console.log(
    `self-test PASSED — ${findings.length} detector(s) fired, prose suppressed, ` +
      "live credential still caught, 0 false positives",
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
    const info = await stat(nextDir);
    if (!info.isDirectory()) throw new Error("not a directory");
  } catch {
    console.error(
      `No build output at ${nextDir}. Run \`next build\` first, or pass the path explicitly.`,
    );
    process.exit(1);
  }

  // Env files are resolved next to the audited build, NOT next to this script.
  // Those differ whenever the gate runs from a git worktree, and getting it
  // wrong silently shrinks coverage to whatever `.env.example` happens to
  // declare — a pass that means nothing.
  const appDir = dirname(nextDir);
  const secrets = await secretsFromEnvFiles(appDir);
  console.log(`Auditing prerender cache in ${nextDir}`);
  console.log(`  env declarations read from ${appDir}`);
  console.log(`  ${secrets.size} secret-bearing env var(s) under test`);
  if (secrets.size < MIN_SECRETS_UNDER_TEST) {
    throw new Error(
      `Only ${secrets.size} secret(s) resolved from ${appDir}/.env* — below the ` +
        `floor of ${MIN_SECRETS_UNDER_TEST}. This app declares far more, so the ` +
        "precise check would pass while barely looking. Ensure the app's env is " +
        "present (locally `.env.local`; in CI the injected environment plus a " +
        "complete `.env.example`).",
    );
  }

  const allowlist = await loadAllowlist();
  if (allowlist.size > 0) {
    console.log(`  ${allowlist.size} reviewed allowlist exception(s)`);
  }

  const findings = [];

  // Pass 1 — raw artifacts.
  let scanned = 0;
  for (const dir of [join(nextDir, "server"), join(nextDir, "static")]) {
    for await (const file of walk(dir)) {
      scanned += 1;
      const blob = await readFile(file, "utf8").catch(() => "");
      if (blob)
        findSecrets(blob, secrets, file.replace(`${nextDir}/`, ""), findings, allowlist);
    }
  }
  console.log(`  scanned ${scanned} raw artifact(s)`);

  // Pass 2 — decoded postponed state + use-cache values. This is the pass that
  // sees compressed RDC payloads, which pass 1 structurally cannot.
  const decoded = await decodePrerenderData(nextDir);
  findSecrets(decoded, secrets, "decoded prerender data", findings, allowlist);

  if (findings.length > 0) {
    console.error("\nFAIL — secret material reached the prerender cache:\n");
    for (const finding of new Set(findings)) console.error(`  • ${finding}`);
    console.error(
      "\nAnything in the prerender cache must be treated as public. Remove it " +
        "from the cached path, then rotate the affected credential.",
    );
    process.exit(1);
  }

  console.log("\nPASS — no secret material in postponed state or use-cache values.");
}

main().catch((error) => {
  console.error(`audit-prerender-cache failed: ${error.message}`);
  process.exit(1);
});
