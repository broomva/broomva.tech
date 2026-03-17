import { ContentCard } from "@/components/site/content-card";
import { PageHero } from "@/components/site/page-hero";
import { formatDate } from "@/lib/date";
import { getContentList } from "@/lib/content";

export const metadata = {
  title: "Writing",
  description:
    "Long-form essays on harness engineering, control systems, and building AI-native infrastructure.",
};

export default async function WritingPage() {
  const entries = await getContentList("writing");

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-20 pt-10 sm:px-6 sm:pt-14">
      <PageHero
        title="Writing"
        description="Canonical long-form notes from real implementation work: architecture decisions, tradeoffs, and operating models."
      />
      <section className="mt-10 grid gap-4 md:grid-cols-2">
        {entries.map((entry) => (
          <ContentCard
            key={entry.slug}
            title={entry.title}
            summary={entry.summary}
            href={`/writing/${entry.slug}`}
            meta={formatDate(entry.date)}
          />
        ))}
      </section>
    </main>
  );
}
