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

// RFC 7230 §3.2.6: header values are restricted to VCHAR + SP + HTAB.
// Node/undici's Headers.append throws on CR/LF/NUL and other control chars
// (TypeError: invalid header value). An upstream GitHub error string may
// contain newlines (multi-line JSON bodies), which would 500 the route
// during response construction — defeating the whole point of catching the
// mirror failure. We strip the unsafe range and cap length defensively.
const MAX_WARN_TEXT = 512;

function sanitizeHeaderText(value: string): string {
  return value
    .replace(/[\x00-\x1f\x7f]/g, " ")
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
