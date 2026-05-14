import "server-only";
import { createHash } from "node:crypto";

/**
 * Deterministic workspace_id for a given Better Auth userId. Produces a
 * 16-char lowercase hex string from a SHA-256 hash, prefixed with `w-`
 * for URL-readability. The mapping is stable across processes and
 * deploys — a given userId always yields the same workspace_id, no
 * persistent store required.
 *
 * Why a hash and not the userId directly?
 *   - workspace_id appears in URLs; we don't want to leak Better Auth's
 *     internal id shape (which today is a stringified bigint).
 *   - The hash is one-way; URL ≠ user identifier.
 *   - 16 hex chars = 64 bits; collision-resistant well past any
 *     realistic Broomva user count.
 *
 * Why not a JWT-encoded claim?
 *   - This plan defers Anima JWT minting to Plan E (substrate
 *     integration). For workspace_id resolution alone, a stable hash
 *     is sufficient — the auth check happens at the SSE/REST routes
 *     via `requireSession`, not via JWT verification of the URL itself.
 */
export function getWorkspaceId(userId: string): string {
  const hash = createHash("sha256").update(userId).digest("hex");
  return `w-${hash.slice(0, 16)}`;
}
