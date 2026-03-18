import { TopNav } from "@/components/site/top-nav";
import { Footer } from "@/components/site/footer";

export default function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-bg-deep text-text-primary pb-24">
      {children}
      <Footer />
      <TopNav />
    </div>
  );
}
