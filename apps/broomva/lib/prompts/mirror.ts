import { isAdmin } from "@/lib/prompts/admin";
import { commitPromptToGitHub } from "@/lib/prompts/github-commit";

export type GithubMirrorStatus =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Mirror an admin's prompt to the GitHub MDX repo and return a structured
 * status the route can surface to the caller. Returns `null` for non-admin
 * callers (no mirror is attempted, no field is emitted).
 *
 * Catches throws from `commitPromptToGitHub` (network, DNS, TLS, parse) so
 * an admin POST/PUT never 500s on a transient failure — the DB write is
 * preserved and the failure is reported alongside it.
 */
export async function mirrorIfAdmin(
  email: string | undefined | null,
  prompt: Parameters<typeof commitPromptToGitHub>[0],
): Promise<GithubMirrorStatus | null> {
  if (!isAdmin(email)) return null;
  try {
    const ghResult = await commitPromptToGitHub(prompt);
    if (ghResult.success) return { ok: true };
    const error = ghResult.error ?? "unknown";
    console.error("GitHub commit failed:", error);
    return { ok: false, error };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error("GitHub commit threw:", error);
    return { ok: false, error };
  }
}

// RFC 7230 §3.2.6 restricts header values to VCHAR + SP + HTAB, but Node /
// undici's `Headers` enforces the stricter ByteString contract: any code
// point outside 0x20-0x7E throws TypeError on append. Upstream GitHub
// error bodies (taken raw from res.text() in github-commit.ts) can carry
// both control chars (multi-line JSON) and non-ASCII (Unicode in error
// messages) — either would 500 the route during response construction,
// outside mirrorIfAdmin's catch. We replace anything outside printable
// ASCII with '?' and cap length defensively. The full raw error remains
// in the JSON body for callers that need it.
const MAX_WARN_TEXT = 512;

function sanitizeHeaderText(value: string): string {
  return value
    .replace(/[^\x20-\x7e]/g, "?")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .slice(0, MAX_WARN_TEXT);
}

/**
 * Build the `Warning` response header for a failed mirror. Returns an empty
 * object when there's nothing to warn about.
 *
 * Header value follows RFC 7234 §5.5 (`warn-code SP warn-agent SP warn-text`).
 * Error text is sanitized to fit RFC 7230 §3.2.6 header rules and capped at
 * 512 chars to avoid reverse-proxy header-size limits.
 */
export function mirrorWarningHeaders(
  status: GithubMirrorStatus | null,
): Record<string, string> {
  if (!status || status.ok) return {};
  const safe = sanitizeHeaderText(status.error);
  return { Warning: `199 - "GitHub mirror failed: ${safe}"` };
}
