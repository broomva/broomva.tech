import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHero } from "@/components/site/page-hero";
import { ProseContent } from "@/components/site/prose-content";
import { formatDate } from "@/lib/date";
import { getAllSlugs, getContentBySlug } from "@/lib/content";

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
          {project.links.map((link) => (
            <a
              key={link.url}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-border px-4 py-2 text-sm transition hover:border-ai-blue/40 hover:text-ai-blue"
            >
              {link.label}
            </a>
          ))}
        </div>
      ) : null}

      <div className="mt-10 glass rounded-2xl p-6 sm:p-8">
        <ProseContent html={project.html} />
      </div>
    </main>
  );
}
