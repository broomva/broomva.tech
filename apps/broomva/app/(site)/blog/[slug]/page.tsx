import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ContentArticle } from "@/components/site/content-article";
import { PageHero } from "@/components/site/page-hero";
import {
  estimateReadingTime,
  getAllSlugs,
  getContentBySlug,
} from "@/lib/content";
import { formatDate } from "@/lib/date";

export async function generateStaticParams() {
  const slugs = await getAllSlugs("posts");
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const entry = await getContentBySlug("posts", slug);

  if (!entry) {
    return { title: "Post not found" };
  }

  return {
    title: entry.title,
    description: entry.summary,
  };
}

export default async function BlogSlugPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const entry = await getContentBySlug("posts", slug);
  if (!entry) {
    notFound();
  }

  const readingTime = estimateReadingTime(entry.content);

  return (
    <main className="mx-auto w-full max-w-4xl px-4 pb-20 pt-10 sm:px-6 sm:pt-14">
      <PageHero title={entry.title} description={entry.summary} />
      <p className="mt-8 text-text-muted text-xs uppercase tracking-[0.18em]">
        {formatDate(entry.date)}
      </p>
      <ContentArticle
        html={entry.html}
        title={entry.title}
        summary={entry.summary}
        slug={slug}
        tags={entry.tags}
        readingTime={readingTime}
        audioSrc={entry.audio}
      />
    </main>
  );
}
