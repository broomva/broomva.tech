import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHero } from "@/components/site/page-hero";
import { PromptViewer } from "@/components/site/prompt-viewer";
import { formatDate } from "@/lib/date";
import { getAllSlugs, getContentBySlug } from "@/lib/content";
import { getPromptBySlug } from "@/lib/db/queries";

export async function generateStaticParams() {
  const slugs = await getAllSlugs("prompts");
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const entry = await getContentBySlug("prompts", slug);

  if (!entry) {
    return { title: "Prompt not found" };
  }

  return {
    title: entry.title,
    description: entry.summary,
  };
}

export default async function PromptSlugPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const entry = await getContentBySlug("prompts", slug);
  if (!entry) {
    notFound();
  }

  // Merge DB stats (copyCount) if available
  let copyCount = 0;
  try {
    const dbPrompt = await getPromptBySlug(slug);
    if (dbPrompt) copyCount = dbPrompt.copyCount;
  } catch {
    // DB not ready — show 0
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-4 pb-20 pt-10 sm:px-6 sm:pt-14">
      <PageHero title={entry.title} description={entry.summary} />

      <div className="mt-6 flex flex-wrap items-center gap-3">
        {entry.category ? (
          <span className="rounded-full bg-ai-blue/10 px-3 py-1 text-xs font-medium text-ai-blue">
            {entry.category}
          </span>
        ) : null}
        {entry.model ? (
          <span className="rounded-full bg-ai-blue/10 px-3 py-1 text-xs font-medium text-ai-blue">
            {entry.model}
          </span>
        ) : null}
        {entry.version ? (
          <span className="glass-badge font-mono text-[11px]">
            v{entry.version}
          </span>
        ) : null}
        <span className="ml-auto flex items-center gap-3 text-xs uppercase tracking-[0.18em] text-text-muted">
          {copyCount > 0 && (
            <span className="normal-case tracking-normal text-text-muted/50">
              {copyCount} {copyCount === 1 ? "copy" : "copies"}
            </span>
          )}
          {formatDate(entry.date)}
        </span>
      </div>

      {entry.tags.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {entry.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-zinc-800 px-2.5 py-0.5 text-[11px] text-text-muted"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-8">
        <PromptViewer content={entry.content} slug={entry.slug} title={entry.title} variables={entry.variables} />
      </div>

      {entry.links.length > 0 ? (
        <div className="mt-8 rounded-xl border border-zinc-800 bg-zinc-900/30 p-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
            Related
          </h3>
          <ul className="space-y-1">
            {entry.links.map((link) => (
              <li key={link.url}>
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-ai-blue transition hover:text-ai-blue"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </main>
  );
}
