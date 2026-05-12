import type { Route } from "next";
import Link from "next/link";
import { ContentCard } from "@/components/site/content-card";
import { PageHero } from "@/components/site/page-hero";
import { formatDate } from "@/lib/date";
import { getLatest, getPinnedProjects } from "@/lib/content";

export const metadata = {
  title: "Start Here",
  description:
    "A guided entry point to the Rust Agent OS stack, control metalayers, and what I build.",
};

const followLinks = [
  { href: "/links", label: "Link hub" },
  { href: "https://github.com/broomva", label: "GitHub" },
  { href: "https://www.linkedin.com/in/broomva/", label: "LinkedIn" },
  { href: "https://x.com/broomva_tech", label: "X" },
];

export default async function StartHerePage() {
  const [projects, writing, notes] = await Promise.all([
    getPinnedProjects(3),
    getLatest("writing", 3),
    getLatest("notes", 2),
  ]);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-20 pt-10 sm:px-6 sm:pt-14">
      <PageHero
        title="Start here"
        description="I build AI-native, multi-tenant data platforms and agent systems in production — from open-source Rust runtime substrates to live commercial deployments. This page is the shortest route to my best work and to me."
      />

      <section className="mt-10 grid gap-4 rounded-2xl glass p-6 sm:grid-cols-2 sm:gap-6">
        <div>
          <h2 className="font-display text-2xl">What I build</h2>
          <p className="mt-3 text-sm leading-relaxed text-text-secondary">
            Three concurrent Principal-tier roles: Co-founder &amp; CTO at Wedi
            Pay (agentic cross-border payments), Senior ML/AI Lead at Stimulus
            (governed agentic procurement), and Data Architect at TEAM
            International. On the substrate side: the Rust Agent OS stack —
            Life, Symphony, the control metalayer, and the RCS paper series.
          </p>
        </div>
        <div>
          <h2 className="font-display text-2xl">Why it matters</h2>
          <p className="mt-3 text-sm leading-relaxed text-text-secondary">
            Most failures are not model failures. They are harness failures. I
            focus on the systems-level primitives that make agents
            controllable, observable, and useful under real constraints — with
            audit-grade governance as a default property, not an afterthought.
          </p>
        </div>
      </section>

      <section className="mt-6">
        <Link
          href={"/profile" as Route}
          className="glass-card group flex items-center justify-between p-5 transition hover:border-ai-blue/40"
        >
          <div>
            <h2 className="font-display text-xl text-text-primary group-hover:text-ai-blue">
              The full profile →
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-text-secondary">
              Concurrent leadership, anonymized client engagements, the OSS
              substrate, and downloadable CVs in three lengths.
            </p>
          </div>
        </Link>
      </section>

      <section className="mt-12">
        <div className="mb-6 flex items-end justify-between">
          <h2 className="font-display text-3xl">Best projects</h2>
          <Link
            href="/projects"
            className="text-sm text-ai-blue transition hover:text-ai-blue/80"
          >
            All projects
          </Link>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {projects.map((project) => (
            <ContentCard
              key={project.slug}
              title={project.title}
              summary={project.summary}
              href={`/projects/${project.slug}`}
              meta={formatDate(project.date)}
              badge={project.status}
            />
          ))}
        </div>
      </section>

      <section className="mt-12 grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-6 font-display text-3xl">Best writing</h2>
          <div className="grid gap-4">
            {writing.map((entry) => (
              <ContentCard
                key={entry.slug}
                title={entry.title}
                summary={entry.summary}
                href={`/writing/${entry.slug}`}
                meta={formatDate(entry.date)}
              />
            ))}
          </div>
        </div>
        <div>
          <h2 className="mb-6 font-display text-3xl">Recent notes</h2>
          <div className="grid gap-4">
            {notes.map((entry) => (
              <ContentCard
                key={entry.slug}
                title={entry.title}
                summary={entry.summary}
                href={`/notes/${entry.slug}`}
                meta={formatDate(entry.date)}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="mt-12 rounded-2xl glass p-6">
        <h2 className="font-display text-2xl">Where to follow</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          {followLinks.map((item) => (
            item.href.startsWith("/") ? (
              <Link
                key={item.href}
                href={item.href as Route}
                className="rounded-full border border-border px-4 py-2 text-sm transition hover:border-ai-blue/40 hover:text-ai-blue"
              >
                {item.label}
              </Link>
            ) : (
              <a
                key={item.href}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full border border-border px-4 py-2 text-sm transition hover:border-ai-blue/40 hover:text-ai-blue"
              >
                {item.label}
              </a>
            )
          ))}
        </div>
      </section>
    </main>
  );
}
