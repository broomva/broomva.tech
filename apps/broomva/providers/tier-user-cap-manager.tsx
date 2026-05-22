"use client";

/**
 * Tier-User cap lifecycle — mints on sign-in, refreshes on tab focus, clears
 * on sign-out.
 *
 * BRO-1214 / M9-D. Renderless side-effect component mounted inside the
 * `SessionProvider` tree so it can observe sign-in transitions.
 *
 * # Behavior
 *
 *   - On the first session with a non-null `user.id`, calls
 *     `ensureFreshTierUserCap` once. Tracked via sessionStorage so a
 *     single mint attempt happens per browser session (no retry storms
 *     if lifegw is down).
 *   - On `visibilitychange` to `visible`, calls `ensureFreshTierUserCap`
 *     again — this refreshes the cap if it's near expiry, otherwise
 *     no-ops (reads IndexedDB only).
 *   - On user transition (different user id OR sign-out), calls
 *     `clearStoredCap` and resets the session-mint flag.
 *
 * # Failure mode
 *
 * Best-effort. `ensureFreshTierUserCap` returns `null` on any failure;
 * the manager swallows it. `/anima/custody/*` callers continue working
 * via the Neon Auth session cookie (edge proxy at
 * `app/api/anima/custody/[...path]/route.ts` accepts both).
 *
 * # Placement
 *
 * Mount as a sibling of `<SessionProvider>` children — inside the
 * provider so `useSession()` works, but outside the layout's main
 * children tree so it doesn't re-render with the page. Renders `null`.
 */

import { useEffect, useRef } from "react";
import { useSession } from "@/providers/session-provider";
import { clearStoredCap, ensureFreshTierUserCap } from "@/lib/anima/tier-user-cap";

const SESSION_FLAG_KEY = "anima-tier-user-cap-mint-attempted";

function getSessionFlag(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(SESSION_FLAG_KEY);
  } catch {
    return null;
  }
}

function setSessionFlag(userId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(SESSION_FLAG_KEY, userId);
  } catch {
    // Swallow — sessionStorage can throw in private mode.
  }
}

function clearSessionFlag(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(SESSION_FLAG_KEY);
  } catch {
    // Swallow.
  }
}

export function TierUserCapManager(): null {
  const { data: session, isPending } = useSession();
  const userId = session?.user?.id ?? null;
  const lastUserIdRef = useRef<string | null>(null);

  // Mint on sign-in + user-change reconciliation
  useEffect(() => {
    if (isPending) return;
    const prevUserId = lastUserIdRef.current;
    if (userId === prevUserId) return;
    lastUserIdRef.current = userId;

    if (!userId) {
      // Sign-out — clear cap + flag
      void clearStoredCap();
      clearSessionFlag();
      return;
    }

    // Sign-in or user-change
    const flagValue = getSessionFlag();
    if (flagValue === userId) {
      // Already attempted minting for this user this browser session;
      // no retry storm. The tab-focus refresh below will still re-mint
      // when the cap is near expiry.
      return;
    }
    setSessionFlag(userId);
    void ensureFreshTierUserCap(userId);
  }, [userId, isPending]);

  // Refresh on tab-visibility flip to visible
  useEffect(() => {
    if (typeof document === "undefined") return;
    const handler = () => {
      if (document.visibilityState !== "visible") return;
      const currentUserId = lastUserIdRef.current;
      if (!currentUserId) return;
      void ensureFreshTierUserCap(currentUserId);
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);

  return null;
}
