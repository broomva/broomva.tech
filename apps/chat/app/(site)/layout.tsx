import { TopNav } from "@/components/site/top-nav";
import { SiteHeader } from "@/components/site/site-header";
import { ConditionalFooter } from "@/components/site/conditional-footer";
import { ToolbarDockProvider } from "@/components/site/toolbar-dock-context";

export default function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ToolbarDockProvider>
      <div className="flex min-h-screen flex-col bg-bg-deep pt-16 text-text-primary">
        <SiteHeader />
        <main className="flex-1 pb-24">{children}</main>
        <ConditionalFooter />
        <TopNav />
      </div>
    </ToolbarDockProvider>
  );
}
