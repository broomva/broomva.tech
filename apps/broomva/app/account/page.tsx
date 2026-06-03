import { headers } from "next/headers";
import { OnchainIdentitySection } from "@/components/account/onchain-identity-section";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { fetchPasskeyStatus } from "@/lib/anima/passkey-status";
import { getSafeSession } from "@/lib/auth";
import { getBaseAccountLink } from "@/lib/base/queries";

// BRO-1229 — removed `export const dynamic = "force-dynamic"`;
// incompatible with `nextConfig.cacheComponents` (Next.js 16). The
// `await headers()` call already makes this page dynamic-by-default.

export default async function AccountIndexPage() {
  const headerStore = await headers();
  const host = headerStore.get("host");
  const proto = headerStore.get("x-forwarded-proto") ?? "https";
  const base = host ? `${proto}://${host}` : undefined;
  const { data: session } = await getSafeSession({
    fetchOptions: { headers: headerStore },
  });
  const status = await fetchPasskeyStatus(base, {
    headers: { cookie: headerStore.get("cookie") ?? "" },
  });
  const baseLink = session?.user?.id
    ? await getBaseAccountLink(session.user.id)
    : null;

  return (
    <div className="space-y-6">
      {!status.enrolled && (
        <Alert>
          <AlertTitle>You don't have a passkey yet</AlertTitle>
          <AlertDescription>
            Passkeys replace passwords with on-device cryptographic keys. They
            unlock signing Life transactions from broomva.tech without shipping
            your private key off the device.
          </AlertDescription>
        </Alert>
      )}

      <OnchainIdentitySection
        animaAddress={status.enrolled ? status.address : undefined}
        animaDid={status.enrolled ? status.did : undefined}
        baseAddress={baseLink?.address}
        baseLinked={Boolean(baseLink)}
        crossLinked={Boolean(baseLink?.crossLinkVerifiedAt)}
      />
    </div>
  );
}
