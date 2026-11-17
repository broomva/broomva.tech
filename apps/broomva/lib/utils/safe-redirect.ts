/**
 * Single source of truth for "is this redirect target a path on our own site?".
 *
 * A prefix check (`startsWith("/") && !startsWith("//")`) is not enough:
 * browsers treat `\` like `/` and strip tab/newline, so `/\evil.example` and
 * `/\t/evil.example` become protocol-relative URLs that leave the site
 * (BRO-3833 review). Instead, resolve the candidate against a sentinel origin
 * and accept it only if it is still on that origin.
 */
const SENTINEL_ORIGIN = "https://internal.invalid";

function normalizeOnSentinel(candidate: unknown): string | null {
  if (typeof candidate !== "string" || !candidate.startsWith("/")) {
    return null;
  }
  // Backslashes and control characters are normalized away by browsers (and
  // by the WHATWG URL parser) in ways that can turn a path into a host.
  // biome-ignore lint/suspicious/noControlCharactersInRegex: rejecting control characters is the point.
  if (/[\\\u0000-\u001f\u007f]/.test(candidate)) {
    return null;
  }
  let parsed: URL;
  try {
    parsed = new URL(candidate, SENTINEL_ORIGIN);
  } catch {
    return null;
  }
  if (parsed.origin !== SENTINEL_ORIGIN) {
    return null;
  }
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

/**
 * Returns the normalized same-site path (pathname + search + hash) when
 * `candidate` is a site-relative path, otherwise `null`.
 *
 * Callers parse the returned value again (`redirect()`, `new URL(x, base)`),
 * so the output itself is checked, not just the input: dot segments can
 * normalize "/.//evil.example" or "/a/..//evil.example" into the
 * protocol-relative "//evil.example" (BRO-3833 review, round 2). The result
 * must not start with "//" and must be a fixed point of normalization.
 */
export function safeInternalPath(candidate: unknown): string | null {
  const normalized = normalizeOnSentinel(candidate);
  if (normalized === null || normalized.startsWith("//")) {
    return null;
  }
  if (normalizeOnSentinel(normalized) !== normalized) {
    return null;
  }
  return normalized;
}
