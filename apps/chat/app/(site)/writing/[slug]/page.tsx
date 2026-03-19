import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHero } from "@/components/site/page-hero";
import { ProseContent } from "@/components/site/prose-content";
import { formatDate } from "@/lib/date";
import { getAllSlugs, getContentBySlug } from "@/lib/content";

export async function generateStaticParams() {
  const slugs = await getAllSlugs("writing");
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const entry = await getContentBySlug("writing", slug);

  if (!entry) {
    return { title: "Article not found" };
  }

  return {
    title: entry.title,
    description: entry.summary,
    openGraph: {
      title: entry.title,
      description: entry.summary,
      type: "article",
      publishedTime: entry.date,
      tags: entry.tags,
    },
    twitter: {
      card: "summary_large_image",
      title: entry.title,
      description: entry.summary,
    },
  };
}

export default async function WritingSlugPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const entry = await getContentBySlug("writing", slug);
  if (!entry) {
    notFound();
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-4 pb-20 pt-10 sm:px-6 sm:pt-14">
      <PageHero title={entry.title} description={entry.summary} />
      <p className="mt-8 text-xs uppercase tracking-[0.18em] text-text-muted">
        {formatDate(entry.date)}
      </p>
      <div className="mt-8 glass rounded-2xl p-6 sm:p-8">
        <ProseContent html={entry.html} />
      </div>
    </main>
  );
}
