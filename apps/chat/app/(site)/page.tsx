import type { Route } from "next";
import Link from "next/link";
import { ContentCard } from "@/components/site/content-card";
import Particles from "@/components/site/particles";
import { formatDate } from "@/lib/date";
import { getLatest, getPinnedProjects } from "@/lib/content";
import { getRecentRepos } from "@/lib/github";

const socials = [
  { href: "https://github.com/broomva", label: "GitHub" },
  { href: "https://www.linkedin.com/in/broomva/", label: "LinkedIn" },
  { href: "https://x.com/broomva_tech", label: "X" },
  { href: "/links", label: "Link hub" },
];

export default async function Home() {
  const [projects, writing, notes, repos] = await Promise.all([
    getPinnedProjects(3),
    getLatest("writing", 3),
    getLatest("notes", 3),
    getRecentRepos("broomva", 6),
  ]);

  return (
    <main className="relative mx-auto w-full max-w-6xl px-4 pb-24 pt-10 sm:px-6 sm:pt-16">
      <Particles
        className="pointer-events-none absolute inset-0 -z-10"
        quantity={180}
        staticity={18}
        ease={60}
      />

      {/* Hero */}
      <section className="glass-card relative overflow-hidden px-6 py-16 sm:px-12">
        <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-ai-blue/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 -left-20 h-72 w-72 rounded-full bg-web3-green/10 blur-3xl" />
        <p className="relative text-xs uppercase tracking-[0.25em] text-ai-blue">
          Carlos D. Escobar-Valbuena
        </p>
        <h1 className="relative mt-3 font-display text-4xl text-text-primary sm:text-6xl">
          Building autonomous software systems
        </h1>
        <p className="relative mt-5 max-w-3xl text-base leading-relaxed text-text-secondary sm:text-lg">
          Rust Agent OS stack, control metalayers, and harness engineering for
          AI-native workflows. I ship OSS and write about what works in
          production.
        </p>
        <div className="relative mt-8 flex flex-wrap items-center gap-3">
          <Link
            href="/start-here"
            className="glass-button glass-button-primary rounded-full px-5 py-2.5 text-sm font-semibold"
          >
            Start here
          </Link>
          <Link
            href="/contact"
            className="glass-button rounded-full px-5 py-2.5 text-sm font-semibold"
          >
            Collaborate
          </Link>
        </div>
        <div className="relative mt-10 rounded-2xl glass p-6">
          <p className="text-xs uppercase tracking-[0.2em] text-text-muted">
            Where to follow
          </p>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
            {socials.map((social) =>
              social.href.startsWith("/") ? (
                <Link
                  key={social.href}
                  href={social.href as Route}
                  className="text-text-secondary transition hover:text-ai-blue"
                >
                  {social.label}
                </Link>
              ) : (
                <a
                  key={social.href}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-text-secondary transition hover:text-ai-blue"
                >
                  {social.label}
                </a>
              ),
            )}
          </div>
        </div>
      </section>

      {/* Recent Repos */}
      {repos.length > 0 && (
        <section className="mt-10">
          <div className="glass rounded-3xl p-6 sm:p-8">
            <p className="text-xs uppercase tracking-[0.2em] text-ai-blue">
              Open Source
            </p>
            <h2 className="mt-2 font-display text-3xl text-text-primary sm:text-4xl">
              Recent Repos
            </h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {repos.map((repo) => (
                <a
                  key={repo.name}
                  href={repo.html_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group glass-card p-4 transition hover:border-ai-blue/40"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-display text-lg text-text-primary transition group-hover:text-ai-blue">
                      {repo.name}
                    </p>
                    {repo.stargazers_count > 0 && (
                      <span className="shrink-0 text-xs text-text-muted">
                        &#9733; {repo.stargazers_count}
                      </span>
                    )}
                  </div>
                  {repo.description && (
                    <p className="mt-1 line-clamp-2 text-sm text-text-muted">
                      {repo.description}
                    </p>
                  )}
                  {repo.language && (
                    <p className="mt-2 text-xs text-text-muted/70">
                      {repo.language}
                    </p>
                  )}
                </a>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Chat CTA */}
      <section className="mt-10">
        <div className="glass rounded-3xl p-6 sm:p-8">
          <div className="mx-auto max-w-3xl">
            <p className="text-xs uppercase tracking-[0.2em] text-ai-blue">
              Interactive
            </p>
            <h2 className="mt-2 font-display text-3xl text-text-primary sm:text-4xl">
              Talk with Broomva
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-text-secondary sm:text-base">
              Use the live chat workspace for prompts, tool calls, and threaded
              conversation history.
            </p>
            <Link
              href="/chat"
              className="group glass-card mt-6 block p-4 transition hover:border-ai-blue/40"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-text-muted">
                  Prompt Broomva...
                </span>
                <span className="glass-button glass-button-primary rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em]">
                  Open chat
                </span>
              </div>
            </Link>
          </div>
        </div>
      </section>

      {/* Pinned Projects */}
      <section className="mt-14">
        <div className="mb-6 flex items-end justify-between">
          <h2 className="font-display text-3xl text-text-primary">
            Pinned Projects
          </h2>
          <Link
            href="/projects"
            className="text-sm text-ai-blue transition hover:text-ai-blue"
          >
            View all
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

      {/* Writing & Notes */}
      <section className="mt-14 grid gap-6 lg:grid-cols-2">
        <div>
          <div className="mb-6 flex items-end justify-between">
            <h2 className="font-display text-3xl text-text-primary">
              Latest Writing
            </h2>
            <Link
              href="/writing"
              className="text-sm text-ai-blue transition hover:text-ai-blue"
            >
              Read all
            </Link>
          </div>
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
          <div className="mb-6 flex items-end justify-between">
            <h2 className="font-display text-3xl text-text-primary">
              Recent Notes
            </h2>
            <Link
              href="/notes"
              className="text-sm text-ai-blue transition hover:text-ai-blue"
            >
              Browse notes
            </Link>
          </div>
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
    </main>
  );
}
