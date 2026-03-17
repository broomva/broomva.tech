import { TopNav } from "@/components/site/top-nav";
import { Footer } from "@/components/site/footer";

export default function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-black text-zinc-100">
      <TopNav />
      {children}
      <Footer />
    </div>
  );
}
