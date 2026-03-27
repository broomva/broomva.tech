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
      <div className="min-h-screen bg-bg-deep text-text-primary pb-24 pt-16">
        <SiteHeader />
        {children}
        <ConditionalFooter />
        <TopNav />
      </div>
    </ToolbarDockProvider>
  );
}
