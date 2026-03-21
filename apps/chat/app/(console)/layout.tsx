import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AppSidebar } from "@/components/app-sidebar";
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

  const user = session.user
    ? {
        name: session.user.name ?? "Agent",
        email: session.user.email ?? "agent@life.os",
        avatar: session.user.image ?? "",
      }
    : undefined;

  return (
    <ToolbarDockProvider>
      <SidebarProvider>
        <AppSidebar variant="inset" user={user} />
        <SidebarInset>
          <SiteHeader />
          <div className="flex flex-1 flex-col pb-24">
            <main className="flex-1 overflow-y-auto">{children}</main>
          </div>
        </SidebarInset>
      </SidebarProvider>
      <TopNav />
    </ToolbarDockProvider>
  );
}
