import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ContentArticle } from "@/components/site/content-article";
import { PageHero } from "@/components/site/page-hero";
import { formatDate } from "@/lib/date";
import { getAllSlugs, getContentBySlug, estimateReadingTime } from "@/lib/content";

/**
 * A frontmatter link is "internal" when its url is a site-relative path.
 * Internal links route via Next.js <Link> (SPA nav, no new tab); external
 * links stay `<a target="_blank" rel="noopener noreferrer">`.
 */
function isInternalUrl(url: string): boolean {
  return url.startsWith("/") && !url.startsWith("//");
}

export async function generateStaticParams() {
  const slugs = await getAllSlugs("projects");
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const project = await getContentBySlug("projects", slug);

  if (!project) {
    return { title: "Project not found" };
  }

  return {
    title: project.title,
    description: project.summary,
  };
}

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const project = await getContentBySlug("projects", slug);
  if (!project) {
    notFound();
  }

  const readingTime = estimateReadingTime(project.content);

  return (
    <main className="mx-auto w-full max-w-4xl px-4 pb-20 pt-10 sm:px-6 sm:pt-14">
      <PageHero title={project.title} description={project.summary} />

      <div className="mt-8 flex flex-wrap gap-3 text-xs uppercase tracking-[0.18em] text-text-muted">
        <span>{formatDate(project.date)}</span>
        {project.status ? (
          <span className="rounded-full border border-border px-2 py-1">
            {project.status}
          </span>
        ) : null}
      </div>

      {project.links.length ? (
        <div className="mt-6 flex flex-wrap gap-3">
          {project.links.map((link) => {
            const className =
              "rounded-full border border-border px-4 py-2 text-sm transition hover:border-ai-blue/40 hover:text-ai-blue";
            return isInternalUrl(link.url) ? (
              // Frontmatter link — typed as free-form `string`, so cast to
              // Next.js's typed Route helper. Runtime value is validated by
              // isInternalUrl() above.
              <Link
                key={link.url}
                href={link.url as Route}
                className={className}
              >
                {link.label}
              </Link>
            ) : (
              <a
                key={link.url}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className={className}
              >
                {link.label}
              </a>
            );
          })}
        </div>
      ) : null}

      <ContentArticle
        html={project.html}
        title={project.title}
        summary={project.summary}
        slug={slug}
        tags={project.tags}
        readingTime={readingTime}
        audioSrc={project.audio}
      />
    </main>
  );
}
