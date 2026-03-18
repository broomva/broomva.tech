"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { ContentSummary } from "@/lib/content";
import type { GitHubRepo } from "@/lib/github";
import { ContentCard } from "@/components/site/content-card";
import { ScrollReveal } from "@/components/site/scroll-reveal";
import { formatDate } from "@/lib/date";
import ThermodynamicGrid from "@/components/ui/interactive-thermodynamic-grid";

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

const socials = [
  { href: "https://github.com/broomva", label: "GitHub" },
  { href: "https://www.linkedin.com/in/broomva/", label: "LinkedIn" },
  { href: "https://x.com/broomva_tech", label: "X" },
  { href: "/links", label: "Link hub" },
];

const stack = [
  {
    name: "Symphony",
    role: "Orchestration",
    description:
      "Dispatch, lifecycle, and hook management for coding agents across issue trackers.",
    href: "/projects/symphony",
  },
  {
    name: "Control Kernel",
    role: "Governance & safety",
    description:
      "Typed setpoints, safety shields, and multi-rate control loops that keep agents bounded.",
    href: "/projects/control-metalayer",
  },
  {
    name: "Autoany",
    role: "Recursive improvement",
    description:
      "Evaluator-Governed Recursive Improvement (EGRI) — safe, measurable, rollback-capable optimization.",
    href: "/projects/aios",
  },
  {
    name: "aiOS",
    role: "Agent OS kernel",
    description:
      "The contract layer — state, memory, tools, and event taxonomy for agent runtimes.",
    href: "/projects/aios",
  },
  {
    name: "Arcan",
    role: "Runtime",
    description:
      "Production runtime implementing the aiOS kernel contract.",
    href: "/projects/aios",
  },
  {
    name: "Lago · Vigil · Praxis",
    role: "Infrastructure",
    description:
      "Durable persistence, OpenTelemetry-native observability, and canonical tool execution.",
    href: "/projects/aios",
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
        <StackSection />
        <ReposSection repos={repos} />
        <ContentSection writing={writing} notes={notes} />
      </div>
    </main>
  );
}

/* ------------------------------------------------------------------ */
/*  Hero                                                               */
/* ------------------------------------------------------------------ */

function HeroSection() {
  const router = useRouter();
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const openChat = useCallback(() => {
    setChatOpen(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => inputRef.current?.focus());
    });
  }, []);

  const submitChat = useCallback(() => {
    const trimmed = chatInput.trim();
    if (!trimmed) return;
    router.push(`/chat?q=${encodeURIComponent(trimmed)}`);
  }, [chatInput, router]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        submitChat();
      }
      if (e.key === "Escape") {
        setChatOpen(false);
        setChatInput("");
      }
    },
    [submitChat],
  );

  return (
    <section className="relative flex min-h-[90vh] flex-col items-center justify-center overflow-hidden px-4 sm:px-6">
      <ThermodynamicGrid
        resolution={12}
        coolingFactor={0.96}
        className="absolute inset-0 z-0"
      />

      <div className="pointer-events-none absolute -right-32 top-1/4 z-[1] h-[28rem] w-[28rem] rounded-full bg-ai-blue/10 blur-[120px]" />
      <div className="pointer-events-none absolute -left-24 bottom-1/4 z-[1] h-96 w-96 rounded-full bg-web3-green/8 blur-[100px]" />

      <div className="pointer-events-none relative z-10 mx-auto w-full max-w-4xl text-center">
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
          Lead AI at Stimulus. Databricks expert. Rust Agent OS builder.
          From scalable data pipelines to autonomous agent infrastructure
          — reliability engineering across software, body, and craft.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.5,
            delay: 0.45,
            ease: [0.25, 0.1, 0.25, 1],
          }}
          className="mt-6 flex flex-wrap justify-center gap-3 pointer-events-auto"
        >
          {socials.map((item) =>
            item.href.startsWith("/") ? (
              <Link
                key={item.href}
                href={item.href as Route}
                className="rounded-full border border-border/60 bg-bg-surface/20 px-4 py-1.5 text-xs tracking-wide text-text-muted backdrop-blur-sm transition hover:border-ai-blue/50 hover:text-ai-blue"
              >
                {item.label}
              </Link>
            ) : (
              <a
                key={item.href}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full border border-border/60 bg-bg-surface/20 px-4 py-1.5 text-xs tracking-wide text-text-muted backdrop-blur-sm transition hover:border-ai-blue/50 hover:text-ai-blue"
              >
                {item.label}
              </a>
            ),
          )}
        </motion.div>

        {/* Inline chat prompt trigger */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.5,
            delay: 0.55,
            ease: [0.25, 0.1, 0.25, 1],
          }}
          className="mt-10"
        >
          <button
            type="button"
            onClick={openChat}
            className="group glass-card pointer-events-auto mx-auto flex w-full max-w-xl cursor-text items-center justify-between gap-3 px-5 py-4 transition hover:border-ai-blue/40"
          >
            <span className="text-sm text-text-muted transition group-hover:text-text-secondary">
              Prompt Broomva...
            </span>
            <span className="glass-button glass-button-primary shrink-0 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em]">
              Chat
            </span>
          </button>
        </motion.div>
      </div>

      {/* scroll indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2, duration: 0.8 }}
        className="pointer-events-none absolute bottom-8 z-10 flex flex-col items-center gap-2"
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

      {/* Full-screen chat overlay */}
      <AnimatePresence>
        {chatOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
            className="fixed inset-0 z-50 flex items-center justify-center px-4"
            onClick={() => {
              setChatOpen(false);
              setChatInput("");
            }}
          >
            {/* Thermodynamic grid backdrop behind blur */}
            <ThermodynamicGrid
              resolution={18}
              coolingFactor={0.97}
              className="pointer-events-auto absolute inset-0 opacity-60"
            />
            <div className="absolute inset-0 bg-bg-deep/60 backdrop-blur-xl" />
            <div className="pointer-events-none absolute -right-32 top-1/4 h-[32rem] w-[32rem] rounded-full bg-ai-blue/15 blur-[140px]" />
            <div className="pointer-events-none absolute -left-24 bottom-1/4 h-[28rem] w-[28rem] rounded-full bg-web3-green/10 blur-[120px]" />
            <div className="pointer-events-none absolute left-1/2 top-1/3 h-64 w-64 -translate-x-1/2 rounded-full bg-ai-blue/8 blur-[100px]" />

            {/* Chat input card */}
            <motion.div
              initial={{ opacity: 0, y: 40, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.98 }}
              transition={{
                duration: 0.45,
                ease: [0.25, 0.1, 0.25, 1],
              }}
              className="relative w-full max-w-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <motion.p
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15, duration: 0.4 }}
                className="mb-4 text-center text-xs uppercase tracking-[0.25em] text-ai-blue"
              >
                Ask me anything
              </motion.p>

              <div className="glass-heavy relative overflow-hidden rounded-2xl border border-border/50 shadow-lg shadow-ai-blue/5">
                <textarea
                  ref={inputRef}
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask about systems thinking, agent architecture, or what I'm building now..."
                  rows={3}
                  className="w-full resize-none bg-transparent px-6 pb-14 pt-6 text-base text-text-primary placeholder:text-text-muted/60 focus:outline-none sm:text-lg"
                />

                <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between border-t border-border/30 px-4 py-3">
                  <span className="text-[11px] text-text-muted/50">
                    <kbd className="rounded border border-border/40 px-1.5 py-0.5 font-mono text-[10px]">
                      Enter
                    </kbd>
                    {" "}to send{" · "}
                    <kbd className="rounded border border-border/40 px-1.5 py-0.5 font-mono text-[10px]">
                      Esc
                    </kbd>
                    {" "}to close
                  </span>
                  <button
                    type="button"
                    onClick={submitChat}
                    disabled={!chatInput.trim()}
                    className="glass-button glass-button-primary rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.15em] disabled:opacity-30 disabled:hover:transform-none"
                  >
                    Send
                  </button>
                </div>
              </div>

              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3, duration: 0.5 }}
                className="mt-4 text-center text-xs text-text-muted/40"
              >
                Powered by Broomva AI
              </motion.p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
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
            10 Rust crates, 500+ tests. A control-theory-native ecosystem
            for autonomous software development.
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {stack.map((item, i) => (
              <ScrollReveal key={item.name} delay={i * 0.1} direction="left">
                <Link
                  href={item.href as Route}
                  className="group glass-card block h-full transition hover:border-ai-blue/40"
                >
                  <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ai-blue/50">
                    {String(i + 1).padStart(2, "0")}
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
            Flagship Repos
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

