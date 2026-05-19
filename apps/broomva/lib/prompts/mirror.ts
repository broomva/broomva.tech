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

/**
 * Build the `Warning` response header for a failed mirror. Returns an empty
 * object when there's nothing to warn about.
 *
 * Header value follows RFC 7234 §5.5 (`warn-code SP warn-agent SP warn-text`).
 * Backslashes and double-quotes inside the error string are escaped so the
 * quoted-string parses cleanly regardless of the upstream error shape.
 */
export function mirrorWarningHeaders(
  status: GithubMirrorStatus | null,
): Record<string, string> {
  if (!status || status.ok) return {};
  const escaped = status.error.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return { Warning: `199 - "GitHub mirror failed: ${escaped}"` };
}
