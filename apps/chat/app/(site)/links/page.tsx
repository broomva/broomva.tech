import { PageHero } from "@/components/site/page-hero";
import { getContentList } from "@/lib/content";
import { LinksContent } from "./links-content";

export const metadata = {
  title: "Links",
  description:
    "Link hub for broomva.tech — featured content, projects, profiles, and everything worth opening.",
};

export default async function LinksPage() {
  const writing = await getContentList("writing");
  const projects = await getContentList("projects");

  const latestWriting = writing
    .sort(
      (a, b) =>
        new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime(),
    )
    .slice(0, 4);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 pb-20 pt-10 sm:px-6 sm:pt-14">
      <PageHero
        title="Links"
        description="Featured content, active projects, and public profiles — one place."
      />
      <LinksContent latestWriting={latestWriting} projects={projects} />
    </main>
  );
}
