import { headers } from "next/headers";
import { HeroSection, InstallSection } from "@/components/site/landing-sections";
import {
  ContentSection,
  StackSection,
} from "@/components/site/landing-static-sections";
import { getSafeSession } from "@/lib/auth";
import { config } from "@/lib/config";
import { getLatest } from "@/lib/content";

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: config.appName,
  url: config.appUrl,
  description: config.appDescription,
  author: {
    "@type": "Person",
    name: "Carlos D. Escobar-Valbuena",
    url: config.appUrl,
  },
  publisher: {
    "@type": "Person",
    name: "Carlos D. Escobar-Valbuena",
    url: config.appUrl,
  },
};

export default async function Home() {
  const [writing, notes, session] = await Promise.all([
    getLatest("writing", 3),
    getLatest("notes", 3),
    getSafeSession({ fetchOptions: { headers: await headers() } }),
  ]);
  const userName = session.data?.user?.name ?? null;

  return (
    <>
      {/* JSON-LD inlined into SSR HTML — crawlers see it without blocking hydration */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <main className="relative">
        <HeroSection userName={userName} />
        <div className="mx-auto w-full max-w-6xl px-4 pb-24 sm:px-6">
          <InstallSection />
          <StackSection />
          <ContentSection writing={writing} notes={notes} />
        </div>
      </main>
    </>
  );
}
