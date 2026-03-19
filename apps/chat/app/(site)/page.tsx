import Script from "next/script";
import { LandingClient } from "@/components/site/landing-sections";
import { config } from "@/lib/config";
import { getLatest, getPinnedProjects } from "@/lib/content";
import { getRecentRepos } from "@/lib/github";

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
  const [projects, writing, notes, repos] = await Promise.all([
    getPinnedProjects(3),
    getLatest("writing", 3),
    getLatest("notes", 3),
    getRecentRepos("broomva", 6),
  ]);

  return (
    <>
      <Script
        id="json-ld"
        type="application/ld+json"
        strategy="beforeInteractive"
      >
        {JSON.stringify(jsonLd)}
      </Script>
      <LandingClient
        projects={projects}
        writing={writing}
        notes={notes}
        repos={repos}
      />
    </>
  );
}
