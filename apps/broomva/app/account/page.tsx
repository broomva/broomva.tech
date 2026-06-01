/**
 * /account dashboard — minimal status summary with a CTA to enrollment.
 *
 * BRO-1213 / M9-C. The dashboard is intentionally lightweight; the
 * substantive surface for M9-C is the passkey page. This file exists so
 * `/account` is a valid landing (e.g. after a future post-signin redirect)
 * rather than a 404.
 */

import { headers } from "next/headers";
import Link from "next/link";
import { ConnectBaseAccountCard } from "@/components/account/connect-base-account-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

      <Card>
        <CardHeader>
          <CardTitle>Identity</CardTitle>
          <CardDescription>
            {status.enrolled
              ? "Your Anima identity is active on this device."
              : "Enroll a passkey to mint your Anima identity (DID + wallet)."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {status.enrolled ? (
            <>
              <FieldRow label="DID" value={status.did} mono />
              {status.address && (
                <FieldRow label="Wallet" value={status.address} mono />
              )}
            </>
          ) : (
            <p className="text-muted-foreground">
              Anima identity not yet provisioned.
            </p>
          )}
        </CardContent>
        <CardFooter>
          <Button asChild>
            <Link href="/account/security/passkey">
              {status.enrolled ? "Manage passkey" : "Enroll passkey"}
            </Link>
          </Button>
        </CardFooter>
      </Card>

      <ConnectBaseAccountCard
        initialLinked={Boolean(baseLink)}
        initialAddress={baseLink?.address}
      />
    </div>
  );
}

function FieldRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
      <div className="w-24 font-medium text-foreground text-xs uppercase tracking-wider">
        {label}
      </div>
      <div
        className={`flex-1 break-all text-foreground/90 ${mono ? "font-mono text-xs" : "text-sm"}`}
      >
        {value}
      </div>
    </div>
  );
}
