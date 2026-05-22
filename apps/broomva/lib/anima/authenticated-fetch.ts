/**
 * `fetch` wrapper that auto-attaches the current Tier-User cap.
 *
 * BRO-1214 / M9-D. Drop-in replacement for `fetch()` used when calling
 * `/anima/custody/*` endpoints from browser code. The wrapper:
 *
 *   1. Ensures a non-expired Tier-User cap is available via
 *      `ensureFreshTierUserCap`. If the user isn't signed in OR minting
 *      fails, falls through to a plain fetch — the edge proxy still
 *      accepts the Neon Auth session cookie, so calls continue working.
 *   2. Attaches `Authorization: Bearer <cap-jwt>` to the outbound headers.
 *   3. Forwards `credentials: "include"` so the Neon Auth cookie is also
 *      sent (server-side, the edge proxy verifies whichever auth path is
 *      present).
 *
 * # When to use
 *
 *   - Any browser-side `fetch` to `/api/anima/custody/*`
 *   - Future direct calls to lifegw `/anima/custody/*` when M8.2 resolves
 *     and browser-direct lifegw becomes viable (Tier-User cap is the
 *     intended bearer on that path)
 *
 * # When NOT to use
 *
 *   - Server-side code (no IndexedDB, no session cookies — use
 *     `mintTier1ForConsumer` instead)
 *   - WebSocket upgrades (Tier-User caps are HTTP-only per Spec D; WS
 *     paths use Tier-1 over `Sec-WebSocket-Protocol: bearer.*`)
 */

import { ensureFreshTierUserCap, type TierUserCap } from "./tier-user-cap";

export interface AuthenticatedFetchOptions extends RequestInit {
  /**
   * Userid for cap minting. Required because the cap is per-user; pass
   * the same id the SessionProvider yields via `useSession().data?.user?.id`.
   * If absent or empty, the wrapper falls through to a plain `fetch` with
   * `credentials: "include"` (Neon Auth cookie path).
   */
  userId?: string | null;
  /**
   * Pre-resolved cap. If provided, skips the IndexedDB / mint step and
   * attaches this cap directly. Useful for callers that already pulled
   * the cap from the Provider context (avoids a second IndexedDB hit).
   */
  cap?: TierUserCap | null;
}

export async function animaCustodyFetch(
  input: RequestInfo | URL,
  options: AuthenticatedFetchOptions = {},
): Promise<Response> {
  const { userId, cap: providedCap, headers: callerHeaders, ...rest } = options;

  let cap: TierUserCap | null = providedCap ?? null;
  if (!cap && userId) {
    cap = await ensureFreshTierUserCap(userId);
  }

  const headers = new Headers(callerHeaders ?? {});
  if (cap) {
    headers.set("authorization", `Bearer ${cap.token}`);
  }

  return fetch(input, {
    ...rest,
    headers,
    credentials: rest.credentials ?? "include",
  });
}
