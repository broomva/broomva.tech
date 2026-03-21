import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { ConsoleSidebar } from "@/components/console-sidebar";
import { SiteHeader } from "@/components/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TopNav } from "@/components/site/top-nav";
import { ToolbarDockProvider } from "@/components/site/toolbar-dock-context";
import { getSafeSession } from "@/lib/auth";

export default async function ConsoleLayout({
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
    <ToolbarDockProvider>
      <SidebarProvider>
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
  );
}
