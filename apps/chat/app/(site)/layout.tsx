import { TopNav } from "@/components/site/top-nav";
import { SiteHeader } from "@/components/site/site-header";
import { FlickeringFooter } from "@/components/ui/flickering-footer";

export default function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-bg-deep text-text-primary pb-24 pt-16">
      <SiteHeader />
      {children}
      <FlickeringFooter />
      <TopNav />
    </div>
  );
}
