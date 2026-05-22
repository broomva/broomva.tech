"use client";

/**
 * Client-side lazy wrapper around `<PasskeyEnrollmentCard />`.
 *
 * BRO-1229 — moved out of `app/account/security/passkey/page.tsx` (a
 * Server Component). Next.js 16 removed support for
 * `dynamic({ ssr: false })` when called from a Server Component
 * context — the option is now Client-Component-only. By marking this
 * file `"use client"` we re-enable the `ssr: false` path AND keep the
 * lazy chunk boundary so the WebAuthn ceremony code stays out of the
 * shared client shell.
 *
 * Behaviour matches the previous inline shape exactly: same dynamic
 * import target, same `ssr: false`, same skeleton-shaped loading state.
 * The page (`page.tsx`) imports this directly as a regular component —
 * no `nextDynamic` at the page boundary anymore.
 */

import nextDynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";
import type { PasskeyStatus } from "@/lib/anima/passkey-status";

const PasskeyEnrollmentCard = nextDynamic(
  () =>
    import("@/components/account/passkey-enrollment-card").then(
      (m) => m.PasskeyEnrollmentCard,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-3">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-10 w-40" />
      </div>
    ),
  },
);

export interface PasskeyCardLazyProps {
  initialStatus: PasskeyStatus;
  userEmail: string;
  userId: string;
}

/**
 * Server-prop-safe wrapper — props are POJO-serializable so they cross
 * the Server → Client boundary cleanly.
 */
export function PasskeyCardLazy(props: PasskeyCardLazyProps) {
  return <PasskeyEnrollmentCard {...props} />;
}
