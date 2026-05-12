import { headers } from "next/headers";
import { Suspense } from "react";
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
    "@type": "Organization",
    name: config.organization.name,
    url: config.appUrl,
  },
};

export default async function Home() {
  const [writing, notes] = await Promise.all([
    getLatest("writing", 3),
    getLatest("notes", 3),
  ]);

  return (
    <>
      {/* JSON-LD inlined into SSR HTML — crawlers see it without blocking hydration */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <main className="relative">
        {/* Hero personalization (session lookup) streams in via Suspense.
            Anonymous fallback renders immediately, then swaps to the
            personalized greeting when the session resolves. */}
        <Suspense fallback={<HeroSection userName={null} />}>
          <PersonalizedHero />
        </Suspense>
        <div className="mx-auto w-full max-w-6xl px-4 pb-24 sm:px-6">
          <InstallSection />
          <StackSection />
          <ContentSection writing={writing} notes={notes} />
        </div>
      </main>
    </>
  );
}

async function PersonalizedHero() {
  const session = await getSafeSession({
    fetchOptions: { headers: await headers() },
  });
  return <HeroSection userName={session.data?.user?.name ?? null} />;
}
