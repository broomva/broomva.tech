/**
 * /account/security/passkey — passkey enrollment + status surface.
 *
 * BRO-1213 / M9-C; BRO-1229 — moved the `dynamic({ ssr: false })` call
 * into the client-side `<PasskeyCardLazy>` wrapper because Next.js 16
 * only allows that option from Client Component contexts. The lazy
 * chunk boundary is preserved (WebAuthn ceremony code stays out of the
 * shared client shell); only the file that owns `nextDynamic` moved.
 *
 * # State 1 + 2 handling
 *
 * - On the server we hit the edge proxy `/api/anima/custody/status` to
 *   pre-populate `initialStatus`. State 2 (existing-device sync) shows
 *   directly as "enrolled" — no extra ceremony needed.
 * - On the client, when `initialStatus.enrolled === false`, the card's
 *   button runs the WebAuthn ceremony and posts to `/register` (state 1).
 */

import { headers } from "next/headers";
import { PasskeyCardLazy } from "@/components/account/passkey-card-lazy";
import { getSafeSession } from "@/lib/auth";
import { fetchPasskeyStatus } from "@/lib/anima/passkey-status";

// BRO-1229 — removed `export const dynamic = "force-dynamic"`;
// incompatible with `nextConfig.cacheComponents` (Next.js 16). The
// `await headers()` call below already makes this page dynamic-by-
// default, so the explicit opt-in is redundant *and* now blocks the
// build.

export default async function PasskeyPage() {
  const headerStore = await headers();
  const { data: session } = await getSafeSession({
    fetchOptions: { headers: headerStore },
  });

  // Layout already redirects unauthenticated users; this is defensive.
  if (!session?.user?.id) {
    return null;
  }

  const host = headerStore.get("host");
  const proto = headerStore.get("x-forwarded-proto") ?? "https";
  const base = host ? `${proto}://${host}` : undefined;
  const initialStatus = await fetchPasskeyStatus(base, {
    headers: { cookie: headerStore.get("cookie") ?? "" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-semibold text-lg">Passkey</h2>
        <p className="text-muted-foreground text-sm">
          One passkey per device. Syncs across your devices via iCloud
          Keychain or Google Password Manager.
        </p>
      </div>

      <PasskeyCardLazy
        initialStatus={initialStatus}
        userEmail={session.user.email ?? "you@broomva.tech"}
        userId={session.user.id}
      />

      <section className="space-y-2">
        <h3 className="font-medium text-sm">New device without sync</h3>
        <p className="text-muted-foreground text-sm">
          If your new device doesn't share iCloud Keychain or Google Password
          Manager with your existing device, you'll need a rotation cap — a
          short-lived enrollment session you initiate from your existing
          device. That flow lands in the next release (BRO-1214 / M9-D). For
          now, please enroll on a device that already has your passkey
          available via cloud sync.
        </p>
      </section>
    </div>
  );
}
