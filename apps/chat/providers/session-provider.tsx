"use client";

import { createContext, useContext, useEffect, useMemo, useRef } from "react";
import type { Session } from "@/lib/auth";
import authClient from "@/lib/auth-client";
import { usePostHog } from "posthog-js/react";

type SessionContextValue = {
  data: Session | null;
  isPending: boolean;
};

const SessionContext = createContext<SessionContextValue | undefined>(
  undefined
);

export function SessionProvider({
  initialSession,
  children,
}: {
  initialSession?: Session | null;
  children: React.ReactNode;
}) {
  const { data: clientSession, isPending } = authClient.useSession();
  const serverSession = initialSession ?? null;
  const posthog = usePostHog();
  const identifiedRef = useRef<string | null>(null);

  const value = useMemo<SessionContextValue>(() => {
    // Prefer server session as a fallback even after the client hook settles.
    // This avoids "split brain" when client session fetch is blocked/misconfigured
    // (e.g. trustedOrigins mismatch) but the server can still read the cookies.
    const effective = isPending
      ? (serverSession ?? clientSession)
      : (clientSession ?? serverSession);
    return { data: effective, isPending };
  }, [clientSession, serverSession, isPending]);

  // Identify user in PostHog once per session when we have a stable user id
  useEffect(() => {
    const user = value.data?.user;
    if (!posthog || !user?.id || identifiedRef.current === user.id) return;
    identifiedRef.current = user.id;
    posthog.identify(user.id, {
      email: user.email,
      name: user.name,
    });
    const orgId = (value.data as { session?: { activeOrganizationId?: string } })?.session?.activeOrganizationId;
    if (orgId) {
      posthog.group("organization", orgId);
    }
  }, [value.data, posthog]);

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error("useSession must be used within a SessionProvider");
  }
  return ctx;
}
