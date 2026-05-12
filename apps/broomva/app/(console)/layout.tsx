import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { ConsoleSidebar } from "@/components/console-sidebar";
import { SiteHeader } from "@/components/site-header";
import {
  SidebarInset,
  SidebarProvider,
  SIDEBAR_COOKIE_NAME,
} from "@/components/ui/sidebar";
import { TopNav } from "@/components/site/top-nav";
import { ToolbarDockProvider } from "@/components/site/toolbar-dock-context";
import { SessionProvider } from "@/providers/session-provider";
import { TRPCReactProvider } from "@/trpc/react";
import { getSafeSession } from "@/lib/auth";
import { captureServerEvent } from "@/lib/analytics/posthog";
import { EVENT_CONSOLE_PAGE_VIEWED } from "@/lib/analytics/events";

export default async function ConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const { data: session } = await getSafeSession({
    fetchOptions: { headers: await headers() },
  });
  const defaultOpen = cookieStore.get(SIDEBAR_COOKIE_NAME)?.value !== "false";

  if (!session?.user) {
    redirect("/login");
  }

  captureServerEvent(session.user.id, EVENT_CONSOLE_PAGE_VIEWED);

  return (
    <TRPCReactProvider>
      <SessionProvider initialSession={session}>
        <ToolbarDockProvider>
          <SidebarProvider defaultOpen={defaultOpen}>
            <ConsoleSidebar
              userName={session.user.name ?? "Agent"}
              userEmail={session.user.email}
              userAvatar={session.user.image ?? ""}
            />
            <SidebarInset>
              <SiteHeader />
              <div className="flex flex-1 flex-col gap-4 p-4 pt-0 pb-24">
                {children}
              </div>
            </SidebarInset>
            <TopNav />
          </SidebarProvider>
        </ToolbarDockProvider>
      </SessionProvider>
    </TRPCReactProvider>
  );
}
