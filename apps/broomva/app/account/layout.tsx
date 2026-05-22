/**
 * /account/* layout — session-gated wrapper that mirrors /settings/* shape.
 *
 * BRO-1213 / M9-C.
 *
 * Authenticated-only. Anonymous users are redirected to /login so the
 * downstream pages can assume `session.user.id` exists.
 */

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AccountNav } from "@/components/account/account-nav";
import { getSafeSession } from "@/lib/auth";

// BRO-1229 — `export const dynamic = "force-dynamic"` is incompatible
// with `nextConfig.cacheComponents` (Next.js 16). The `await headers()`
// call below automatically opts this layout into dynamic rendering, so
// the explicit declaration is redundant *and* now blocks the build.

export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session } = await getSafeSession({
    fetchOptions: { headers: await headers() },
  });

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto flex h-dvh max-h-dvh w-full max-w-4xl flex-1 flex-col px-2 py-2 md:px-4">
      <header className="mb-6">
        <h1 className="font-semibold text-2xl">Account</h1>
        <p className="mt-1 text-muted-foreground text-sm">
          Manage your identity, devices, and security keys.
        </p>
      </header>

      <div className="mb-4 md:hidden">
        <AccountNav orientation="horizontal" />
      </div>
      <div className="flex min-h-0 flex-1 gap-4">
        <div className="hidden md:block">
          <AccountNav orientation="vertical" />
        </div>
        <div className="flex min-h-0 w-full flex-1 flex-col px-4">
          {children}
        </div>
      </div>
    </div>
  );
}
