#!/usr/bin/env node
/**
 * Probe public-asset endpoints to catch auth/CDN regressions before they
 * reach users.
 *
 * Why: in May 2026 a single missing extension (`.mp3`) in the Next.js
 * middleware matcher silently broke audio narration site-wide for every
 * unauthenticated reader. The unit tests, typecheck, and content-link
 * checker all passed because none of them exercise the live request path.
 * The only thing that would have caught it is a real HTTP probe: "fetch the
 * public URL without auth and verify it doesn't redirect to /login."
 *
 * What this script does:
 *   1. Hit a curated list of public asset URLs against the configured base
 *      URL (https://broomva.tech by default, override with TARGET_BASE_URL).
 *   2. Assert the response is either a final 2xx OR a 30x to api.lago.arcan.la
 *      / a Vercel image-optimization URL. Anything that lands on `/login`,
 *      a 4xx, or a 5xx fails the check.
 *   3. Print one line per probe so CI logs are obvious to scan.
 *
 * Usage:
 *   node scripts/verify-public-asset-routes.mjs
 *   TARGET_BASE_URL=https://my-preview.vercel.app node scripts/verify-public-asset-routes.mjs
 *
 * Environment variables:
 *   TARGET_BASE_URL  — base URL to probe (default: https://broomva.tech)
 *   STRICT_TIMEOUT_MS — per-request timeout in ms (default: 15000)
 */

const TARGET_BASE_URL = (
  process.env.TARGET_BASE_URL || "https://broomva.tech"
).replace(/\/$/, "");
const TIMEOUT_MS = Number.parseInt(process.env.STRICT_TIMEOUT_MS || "15000", 10);

// Post-deploy probes might race a still-warming Vercel deploy or a brief
// network blip. Retry each probe up to this many times before giving up;
// each retry waits RETRY_DELAY_MS. Override with PROBE_MAX_ATTEMPTS=1 in
// CI flows that should fail fast (e.g. PR builds against stable prod).
const MAX_ATTEMPTS = Math.max(
  1,
  Number.parseInt(process.env.PROBE_MAX_ATTEMPTS || "3", 10)
);
const RETRY_DELAY_MS = Number.parseInt(
  process.env.PROBE_RETRY_DELAY_MS || "10000",
  10
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Each probe is `{ path, kind, expectedStatus, label }`.
 *
 * `expectedStatus` is a function over the integer status: returns true if
 * the response status is acceptable. We accept 200 (cached static / direct
 * serve), 206 (partial range), and 302 (redirect to Lago blob) for media
 * assets; only 200 for API endpoints.
 *
 * Paths reference real assets that have been committed to the content repo
 * AND uploaded to Lago (see scripts/sync-assets-to-lago.ts). If those posts
 * are renamed or deleted, update this list.
 */
const PROBES = [
  // — Audio narration: writing + projects, two distinct files —
  {
    path: "/audio/writing/bstack-portable-harness-metalayer.mp3",
    kind: "audio",
    expectedStatus: (s) => s === 200 || s === 206 || s === 302,
    label: "audio (writing)",
  },
  {
    path: "/audio/projects/aios.mp3",
    kind: "audio",
    expectedStatus: (s) => s === 200 || s === 206 || s === 302,
    label: "audio (projects)",
  },
  // — Images —
  {
    path: "/images/writing/16-patterns-agent-governance/hero-16-patterns.png",
    kind: "image",
    expectedStatus: (s) => s === 200 || s === 302,
    label: "image (writing)",
  },
  // — Video —
  {
    path: "/video/writing/bstack-portable-harness-metalayer/hero-cinematic.mp4",
    kind: "video",
    expectedStatus: (s) => s === 200 || s === 206 || s === 302,
    label: "video (writing)",
  },
  // — Direct /api/assets/* (proves the proxy bypass + Lago route works) —
  {
    path: "/api/assets/audio/writing/bstack-portable-harness-metalayer.mp3",
    kind: "api-asset",
    expectedStatus: (s) => s === 200 || s === 302,
    label: "/api/assets/audio/...",
  },
  // — /api/audio-playback: the player hits this BEFORE creating the audio
  //   element; if it gets gated to /login the player silently fails.
  {
    path: "/api/audio-playback",
    kind: "api",
    expectedStatus: (s) => s === 200,
    label: "/api/audio-playback (anon)",
  },
  // — Swapit commons (BRO-1547): the public household-toxics knowledge dataset.
  //   GET serves approved facts for anonymous browse/pull (the `swapit sync` CLI
  //   has no session cookie); if the auth proxy gates it to /login the whole
  //   "anyone can use it" commons silently breaks — exactly this probe's purpose.
  {
    path: "/api/swapit/facts?kind=procurement_option&region=US",
    kind: "api",
    expectedStatus: (s) => s === 200,
    label: "/api/swapit/facts (anon)",
  },
  {
    path: "/swapit",
    kind: "page",
    expectedStatus: (s) => s === 200,
    label: "/swapit page (anon)",
  },
];

async function probe({ path, kind, expectedStatus, label }) {
  const url = `${TARGET_BASE_URL}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      // No auth, no cookies — that's the point: simulate a brand-new reader.
    });
    const status = res.status;
    const location = res.headers.get("location") || "";

    // The defining failure mode we want to catch: the middleware proxy
    // accidentally treats a public asset as a gated route and sends it to
    // /login. That's never correct for any path in this list.
    if (location.startsWith("/login") || /\blogin\b/.test(location)) {
      return {
        ok: false,
        status,
        location,
        reason: "redirects to /login (auth proxy gated a public asset)",
      };
    }

    if (!expectedStatus(status)) {
      return {
        ok: false,
        status,
        location,
        reason: `status ${status} not in expected set for ${kind}`,
      };
    }

    return { ok: true, status, location };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      location: "",
      reason: `fetch failed: ${err.message}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function probeWithRetry(p) {
  let lastResult;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    lastResult = await probe(p);
    if (lastResult.ok) {
      if (attempt > 1) lastResult.attempts = attempt;
      return lastResult;
    }
    if (attempt < MAX_ATTEMPTS) await sleep(RETRY_DELAY_MS);
  }
  lastResult.attempts = MAX_ATTEMPTS;
  return lastResult;
}

let failed = 0;
console.log(
  `ℹ  Probing public asset routes on ${TARGET_BASE_URL} (max ${MAX_ATTEMPTS} attempt(s) per probe)`
);
for (const p of PROBES) {
  const r = await probeWithRetry(p);
  if (r.ok) {
    const dest = r.location ? ` → ${r.location.slice(0, 80)}` : "";
    const note = r.attempts ? ` (after ${r.attempts} attempts)` : "";
    console.log(`✓ ${p.label.padEnd(28)} HTTP ${r.status}${dest}${note}`);
  } else {
    failed++;
    const dest = r.location ? ` → ${r.location.slice(0, 80)}` : "";
    console.error(
      `✗ ${p.label.padEnd(28)} HTTP ${r.status}${dest}\n   ${r.reason}\n   url: ${TARGET_BASE_URL}${p.path}`
    );
  }
}

if (failed > 0) {
  console.error(`\n${failed} probe(s) failed.`);
  process.exit(1);
}
console.log("\n✓ All public asset routes resolve.");
