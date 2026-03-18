"use client";

import type { Route } from "next";
import Link from "next/link";
import { motion } from "motion/react";
import type { ContentSummary } from "@/lib/content";
import type { GitHubRepo } from "@/lib/github";
import { ContentCard } from "@/components/site/content-card";
import { ScrollReveal } from "@/components/site/scroll-reveal";
import { formatDate } from "@/lib/date";
import Particles from "@/components/site/particles";

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

const socials = [
  { href: "https://github.com/broomva", label: "GitHub" },
  { href: "https://www.linkedin.com/in/broomva/", label: "LinkedIn" },
  { href: "https://x.com/broomva_tech", label: "X" },
  { href: "/links", label: "Link hub" },
];

const principles = [
  {
    title: "Define the primitive layer",
    description: "Find the irreducible components",
  },
  {
    title: "Map the failure modes",
    description: "Know where it breaks",
  },
  {
    title: "Build recovery paths",
    description: "Design for when it breaks",
  },
  {
    title: "Iterate toward antifragility",
    description: "Get stronger from stress",
  },
  {
    title: "Make it repeatable",
    description: "Future-self and others can run it",
  },
  {
    title: "Optimize for compounding",
    description: "Will this matter in 10 years?",
  },
];

const stack = [
  {
    name: "Symphony",
    role: "Orchestration runtime",
    description:
      "Dispatch, lifecycle, and hook management for coding agents across issue trackers.",
    href: "/projects/symphony",
  },
  {
    name: "Control Metalayer",
    role: "Governance & policy",
    description:
      "Typed setpoints, safety shields, and multi-rate control loops that keep agents bounded.",
    href: "/projects/control-metalayer",
  },
  {
    name: "aiOS",
    role: "Agent OS kernel",
    description:
      "The substrate layer — state, memory, and tool interfaces that agent runtimes build on.",
    href: "/projects/aios",
  },
];

const dimensions = [
  {
    label: "Freediving",
    insight: "Control under duress",
  },
  {
    label: "Endurance",
    insight: "Discipline over discomfort",
  },
  {
    label: "Systems thinking",
    insight: "Body informs code informs life",
  },
];

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface LandingProps {
  projects: ContentSummary[];
  writing: ContentSummary[];
  notes: ContentSummary[];
  repos: GitHubRepo[];
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function LandingClient({
  projects,
  writing,
  notes,
  repos,
}: LandingProps) {
  return (
    <main className="relative">
      <HeroSection />
      <div className="mx-auto w-full max-w-6xl px-4 pb-24 sm:px-6">
        <PrinciplesSection />
        <StackSection />
        <BeyondCodeSection />
        <ReposSection repos={repos} />
        <ChatSection />
        <ProjectsSection projects={projects} />
        <ContentSection writing={writing} notes={notes} />
        <FollowSection />
      </div>
    </main>
  );
}

/* ------------------------------------------------------------------ */
/*  Hero                                                               */
/* ------------------------------------------------------------------ */

function HeroSection() {
  return (
    <section className="relative flex min-h-[90vh] flex-col items-center justify-center px-4 sm:px-6">
      <Particles
        className="pointer-events-none absolute inset-0 -z-10"
        quantity={200}
        staticity={18}
        ease={60}
      />

      <div className="pointer-events-none absolute -right-32 top-1/4 h-[28rem] w-[28rem] rounded-full bg-ai-blue/10 blur-[120px]" />
      <div className="pointer-events-none absolute -left-24 bottom-1/4 h-96 w-96 rounded-full bg-web3-green/8 blur-[100px]" />

      <div className="mx-auto w-full max-w-4xl text-center">
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
          className="text-xs uppercase tracking-[0.3em] text-ai-blue"
        >
          Carlos D. Escobar-Valbuena
        </motion.p>

        <motion.h1
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.7,
            delay: 0.15,
            ease: [0.25, 0.1, 0.25, 1],
          }}
          className="mt-6 font-display text-5xl leading-[1.1] text-text-primary sm:text-7xl"
        >
          Building systems
          <br />
          that last
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.6,
            delay: 0.35,
            ease: [0.25, 0.1, 0.25, 1],
          }}
          className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-text-secondary sm:text-lg"
        >
          Reliability engineering across software, body, and craft. Rust Agent
          OS stack, control metalayers, and harness infrastructure for AI-native
          workflows.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.5,
            delay: 0.55,
            ease: [0.25, 0.1, 0.25, 1],
          }}
          className="mt-10 flex flex-wrap items-center justify-center gap-3"
        >
          <Link
            href="/start-here"
            className="glass-button glass-button-primary rounded-full px-6 py-3 text-sm font-semibold"
          >
            Start here
          </Link>
          <Link
            href="/contact"
            className="glass-button rounded-full px-6 py-3 text-sm font-semibold"
          >
            Collaborate
          </Link>
        </motion.div>
      </div>

      {/* scroll indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2, duration: 0.8 }}
        className="absolute bottom-8 flex flex-col items-center gap-2"
      >
        <span className="text-[10px] uppercase tracking-[0.2em] text-text-muted">
          Scroll
        </span>
        <motion.svg
          animate={{ y: [0, 6, 0] }}
          transition={{ repeat: Infinity, duration: 1.8, ease: "easeInOut" }}
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          className="text-text-muted"
        >
          <path
            d="M8 3v10M4 9l4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </motion.svg>
      </motion.div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Principles                                                         */
/* ------------------------------------------------------------------ */

function PrinciplesSection() {
  return (
    <section className="mt-24 sm:mt-32">
      <ScrollReveal>
        <p className="text-xs uppercase tracking-[0.25em] text-ai-blue">
          How I build
        </p>
        <h2 className="mt-3 font-display text-3xl text-text-primary sm:text-4xl">
          The throughline across all work
        </h2>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-text-secondary sm:text-base">
          Whether it&apos;s agent runtimes, breath-hold training, data
          pipelines, or planning a family — the same principles emerge.
        </p>
      </ScrollReveal>

      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {principles.map((p, i) => (
          <ScrollReveal key={p.title} delay={i * 0.08}>
            <div className="glass-card group h-full">
              <span className="font-mono text-xs text-ai-blue/50">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-2 font-display text-lg text-text-primary">
                {p.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">
                {p.description}
              </p>
            </div>
          </ScrollReveal>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Stack                                                              */
/* ------------------------------------------------------------------ */

function StackSection() {
  return (
    <section className="mt-24 sm:mt-32">
      <ScrollReveal>
        <div className="glass rounded-3xl p-6 sm:p-10">
          <p className="text-xs uppercase tracking-[0.25em] text-ai-blue">
            Agent OS Stack
          </p>
          <h2 className="mt-3 font-display text-3xl text-text-primary sm:text-4xl">
            The stack
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-text-secondary sm:text-base">
            Three layers that turn LLM capability into reliable, controllable
            production workflows.
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {stack.map((item, i) => (
              <ScrollReveal key={item.name} delay={i * 0.1} direction="left">
                <Link
                  href={item.href as Route}
                  className="group glass-card block h-full transition hover:border-ai-blue/40"
                >
                  <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ai-blue/50">
                    Layer {i + 1}
                  </span>
                  <p className="mt-2 font-display text-xl text-text-primary transition group-hover:text-ai-blue">
                    {item.name}
                  </p>
                  <p className="mt-1 text-xs uppercase tracking-[0.15em] text-text-muted">
                    {item.role}
                  </p>
                  <p className="mt-3 text-sm leading-relaxed text-text-secondary">
                    {item.description}
                  </p>
                </Link>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </ScrollReveal>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Beyond Code                                                        */
/* ------------------------------------------------------------------ */

function BeyondCodeSection() {
  return (
    <section className="mt-24 sm:mt-32">
      <ScrollReveal>
        <div className="glass-card relative overflow-hidden px-6 py-12 sm:px-10 sm:py-16">
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-web3-green/10 blur-[80px]" />

          <p className="relative text-xs uppercase tracking-[0.25em] text-web3-green">
            The integration
          </p>

          <blockquote className="relative mt-6 max-w-3xl font-display text-2xl leading-snug text-text-primary sm:text-3xl">
            &ldquo;The discipline that makes you hold your breath for three
            minutes also makes you refactor ruthlessly.&rdquo;
          </blockquote>

          <p className="relative mt-6 max-w-2xl text-sm leading-relaxed text-text-secondary sm:text-base">
            Most people keep work separate from fitness separate from
            relationships. I see one life. The same rigor applies everywhere —
            define primitives, map failures, iterate toward antifragility.
          </p>

          <div className="relative mt-8 grid gap-4 sm:grid-cols-3">
            {dimensions.map((d, i) => (
              <ScrollReveal key={d.label} delay={i * 0.1}>
                <div className="rounded-xl border border-border/50 bg-bg-surface/30 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-text-muted">
                    {d.label}
                  </p>
                  <p className="mt-1 text-sm font-medium text-text-primary">
                    {d.insight}
                  </p>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </ScrollReveal>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Recent Repos                                                       */
/* ------------------------------------------------------------------ */

function ReposSection({ repos }: { repos: GitHubRepo[] }) {
  if (repos.length === 0) return null;

  return (
    <section className="mt-24 sm:mt-32">
      <ScrollReveal>
        <div className="glass rounded-3xl p-6 sm:p-10">
          <p className="text-xs uppercase tracking-[0.25em] text-ai-blue">
            Open Source
          </p>
          <h2 className="mt-3 font-display text-3xl text-text-primary sm:text-4xl">
            Recent Repos
          </h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {repos.map((repo, i) => (
              <ScrollReveal key={repo.name} delay={i * 0.06}>
                <a
                  href={repo.html_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group glass-card block h-full transition hover:border-ai-blue/40"
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
              </ScrollReveal>
            ))}
          </div>
        </div>
      </ScrollReveal>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Chat CTA                                                           */
/* ------------------------------------------------------------------ */

function ChatSection() {
  return (
    <section className="mt-24 sm:mt-32">
      <ScrollReveal direction="scale">
        <div className="glass rounded-3xl p-6 sm:p-10">
          <div className="mx-auto max-w-3xl">
            <p className="text-xs uppercase tracking-[0.25em] text-ai-blue">
              Interactive
            </p>
            <h2 className="mt-3 font-display text-3xl text-text-primary sm:text-4xl">
              Talk with Broomva
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-text-secondary sm:text-base">
              Ask me about systems thinking, agent architecture, or what
              I&apos;m building now.
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
      </ScrollReveal>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Projects                                                           */
/* ------------------------------------------------------------------ */

function ProjectsSection({ projects }: { projects: ContentSummary[] }) {
  return (
    <section className="mt-24 sm:mt-32">
      <ScrollReveal>
        <div className="mb-6 flex items-end justify-between">
          <h2 className="font-display text-3xl text-text-primary">
            Pinned Projects
          </h2>
          <Link
            href="/projects"
            className="text-sm text-ai-blue transition hover:text-ai-blue/80"
          >
            View all
          </Link>
        </div>
      </ScrollReveal>
      <div className="grid gap-4 md:grid-cols-3">
        {projects.map((project, i) => (
          <ScrollReveal key={project.slug} delay={i * 0.08}>
            <ContentCard
              title={project.title}
              summary={project.summary}
              href={`/projects/${project.slug}`}
              meta={formatDate(project.date)}
              badge={project.status}
            />
          </ScrollReveal>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Writing & Notes                                                    */
/* ------------------------------------------------------------------ */

function ContentSection({
  writing,
  notes,
}: {
  writing: ContentSummary[];
  notes: ContentSummary[];
}) {
  return (
    <section className="mt-24 grid gap-6 sm:mt-32 lg:grid-cols-2">
      <div>
        <ScrollReveal>
          <div className="mb-6 flex items-end justify-between">
            <h2 className="font-display text-3xl text-text-primary">
              Latest Writing
            </h2>
            <Link
              href="/writing"
              className="text-sm text-ai-blue transition hover:text-ai-blue/80"
            >
              Read all
            </Link>
          </div>
        </ScrollReveal>
        <div className="grid gap-4">
          {writing.map((entry, i) => (
            <ScrollReveal key={entry.slug} delay={i * 0.08}>
              <ContentCard
                title={entry.title}
                summary={entry.summary}
                href={`/writing/${entry.slug}`}
                meta={formatDate(entry.date)}
              />
            </ScrollReveal>
          ))}
        </div>
      </div>

      <div>
        <ScrollReveal>
          <div className="mb-6 flex items-end justify-between">
            <h2 className="font-display text-3xl text-text-primary">
              Recent Notes
            </h2>
            <Link
              href="/notes"
              className="text-sm text-ai-blue transition hover:text-ai-blue/80"
            >
              Browse notes
            </Link>
          </div>
        </ScrollReveal>
        <div className="grid gap-4">
          {notes.map((entry, i) => (
            <ScrollReveal key={entry.slug} delay={i * 0.08}>
              <ContentCard
                title={entry.title}
                summary={entry.summary}
                href={`/notes/${entry.slug}`}
                meta={formatDate(entry.date)}
              />
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Follow                                                             */
/* ------------------------------------------------------------------ */

function FollowSection() {
  return (
    <section className="mt-24 sm:mt-32">
      <ScrollReveal>
        <div className="rounded-2xl glass p-6 sm:p-8">
          <p className="text-xs uppercase tracking-[0.25em] text-text-muted">
            Where to follow
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            {socials.map((item) =>
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
              ),
            )}
          </div>
        </div>
      </ScrollReveal>
    </section>
  );
}
