import type { ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ToolbarDockProvider } from "@/components/site/toolbar-dock-context";
import { TopNav } from "@/components/site/top-nav";
import { getSafeSession } from "@/lib/auth";
import { requireCurrentLegalAcceptance } from "@/lib/legal-acceptance-gate";

/**
 * /maestro is a top-level route (outside the `(site)` group), so it doesn't get
 * the navigation dock that `ConditionalSiteChrome` mounts. This layout adds the
 * dock surgically (BRO-1372): the only context `TopNav` needs beyond root's
 * `AudioPlaybackProvider` is `ToolbarDockProvider`. No full site header/footer —
 * the console keeps its own chrome, just gains the dock.
 */
export default async function MaestroLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { data: session } = await getSafeSession({
    fetchOptions: { headers: await headers() },
  });
  if (!session?.user) redirect("/login");
  await requireCurrentLegalAcceptance(session.user.id);

  return (
    <ToolbarDockProvider>
      {children}
      <TopNav />
    </ToolbarDockProvider>
  );
}
