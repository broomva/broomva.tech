"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
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

const suggestionPills = [
  { icon: "pencil", label: "Write", prompt: "Help me write a " },
  { icon: "eye", label: "Learn", prompt: "Explain how " },
  { icon: "code", label: "Code", prompt: "Write code that " },
  { icon: "compass", label: "Explore", prompt: "Tell me about " },
];

function getTimeGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function PillIcon({ name }: { name: string }) {
  switch (name) {
    case "pencil":
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
          <path d="m15 5 4 4" />
        </svg>
      );
    case "eye":
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    case "code":
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="16 18 22 12 16 6" />
          <polyline points="8 6 2 12 8 18" />
        </svg>
      );
    case "compass":
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
        </svg>
      );
    default:
      return null;
  }
}

const stack = [
  {
    name: "bstack",
    role: "Agent skills platform",
    description:
      "24 curated agent skills across 7 layers — install the full Broomva development workflow with one command.",
    href: "/skills",
  },
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
    name: "Life",
    role: "Agent OS monorepo",
    description:
      "Arcan runtime, Lago persistence, Vigil observability, Praxis tool execution, Haima finance, and Spaces networking — unified in one Cargo workspace.",
    href: "/projects/life",
  },
  {
    name: "Autoany",
    role: "Recursive improvement",
    description:
      "Evaluator-Governed Recursive Improvement (EGRI) — safe, measurable, rollback-capable optimization loops.",
    href: "/projects/autoany",
  },
  {
    name: "aiOS",
    role: "Kernel contract",
    description:
      "The canonical type system — state vectors, event taxonomy, trait interfaces, and operating modes for all Agent OS crates.",
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
  userName?: string | null;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function LandingClient({
  projects,
  writing,
  notes,
  repos,
  userName,
}: LandingProps) {
  return (
    <main className="relative">
      <HeroSection userName={userName} />
      <div className="mx-auto w-full max-w-6xl px-4 pb-24 sm:px-6">
        <InstallSection />
        <StackSection />
        <ContentSection writing={writing} notes={notes} />
      </div>
    </main>
  );
}

/* ------------------------------------------------------------------ */
/*  Hero                                                               */
/* ------------------------------------------------------------------ */

function HeroSection({ userName }: { userName?: string | null }) {
  const router = useRouter();
  const [chatInput, setChatInput] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const greeting = useMemo(() => getTimeGreeting(), []);
  const firstName = userName?.split(" ")[0] ?? null;

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
    },
    [submitChat],
  );

  const handlePillClick = useCallback(
    (prompt: string) => {
      setChatInput(prompt);
      requestAnimationFrame(() => {
        const el = inputRef.current;
        if (el) {
          el.focus();
          el.setSelectionRange(prompt.length, prompt.length);
        }
      });
    },
    [],
  );

  return (
    <section className="relative -mt-16 flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 pt-16 sm:px-6">
      <ThermodynamicGrid
        resolution={12}
        coolingFactor={0.96}
        className="absolute inset-0 z-0"
      />

      <div className="pointer-events-none absolute -right-32 top-1/4 z-[1] h-[28rem] w-[28rem] rounded-full bg-ai-blue/10 blur-[120px]" />
      <div className="pointer-events-none absolute -left-24 bottom-1/4 z-[1] h-96 w-96 rounded-full bg-web3-green/8 blur-[100px]" />

      <div className="pointer-events-none relative z-10 mx-auto w-full max-w-3xl text-center">
        {/* Greeting */}
        <motion.h1
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.7,
            ease: [0.25, 0.1, 0.25, 1],
          }}
          className="font-display text-4xl leading-[1.15] text-text-primary sm:text-5xl md:text-6xl"
        >
          {firstName ? (
            <>
              {greeting},{" "}
              <span className="relative inline-block text-ai-blue">
                {firstName}
                <motion.span
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ delay: 0.6, duration: 0.5, ease: "easeOut" }}
                  className="absolute -bottom-1 left-0 h-[2px] w-full origin-left rounded-full bg-ai-blue/50"
                />
              </span>
            </>
          ) : (
            <>
              Building systems
              <br />
              that last
            </>
          )}
        </motion.h1>

        {/* Subtitle — changes when logged in */}
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.6,
            delay: 0.2,
            ease: [0.25, 0.1, 0.25, 1],
          }}
          className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-text-secondary sm:text-lg"
        >
          {firstName
            ? "How can I help you today?"
            : "Lead AI at Stimulus. Databricks expert. Rust Agent OS builder. From scalable data pipelines to autonomous agent infrastructure — reliability engineering across software, body, and craft."}
        </motion.p>

        {/* Social links — only when not logged in */}
        {!firstName && (
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.5,
              delay: 0.35,
              ease: [0.25, 0.1, 0.25, 1],
            }}
            className="mt-6 flex flex-wrap justify-center gap-3 pointer-events-auto"
          >
            {socials.map((item) =>
              item.href.startsWith("/") ? (
                <Link
                  key={item.href}
                  href={item.href as Route}
                  className="rounded-full border border-border/40 bg-bg-elevated/40 px-5 py-2 text-xs font-medium tracking-wide text-text-secondary shadow-[inset_0_1px_0_oklch(1_0_0/0.06)] backdrop-blur-md transition-all duration-200 hover:border-ai-blue/40 hover:bg-bg-elevated/60 hover:text-text-primary hover:shadow-[inset_0_1px_0_oklch(1_0_0/0.08),0_0_16px_oklch(0.60_0.12_260/0.12)]"
                >
                  {item.label}
                </Link>
              ) : (
                <a
                  key={item.href}
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full border border-border/40 bg-bg-elevated/40 px-5 py-2 text-xs font-medium tracking-wide text-text-secondary shadow-[inset_0_1px_0_oklch(1_0_0/0.06)] backdrop-blur-md transition-all duration-200 hover:border-ai-blue/40 hover:bg-bg-elevated/60 hover:text-text-primary hover:shadow-[inset_0_1px_0_oklch(1_0_0/0.08),0_0_16px_oklch(0.60_0.12_260/0.12)]"
                >
                  {item.label}
                </a>
              ),
            )}
          </motion.div>
        )}

        {/* Chat input */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.6,
            delay: firstName ? 0.3 : 0.5,
            ease: [0.25, 0.1, 0.25, 1],
          }}
          className={`pointer-events-auto mx-auto w-full max-w-xl ${firstName ? "mt-10" : "mt-8"}`}
        >
          <div className="relative overflow-hidden rounded-2xl border border-border/40 bg-[color-mix(in_oklab,var(--ag-bg-surface)_calc(var(--ag-glass-medium)*100%),transparent)] shadow-[inset_0_1px_0_oklch(1_0_0/0.04),var(--ag-shadow-md)] backdrop-blur-[var(--ag-blur-lg)] backdrop-saturate-[1.4] backdrop-brightness-[1.05] transition-all duration-200 focus-within:border-ai-blue/40 focus-within:shadow-[inset_0_1px_0_oklch(1_0_0/0.06),0_0_24px_oklch(0.60_0.12_260/0.10)]">
            <textarea
              ref={inputRef}
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="How can I help you today?"
              rows={1}
              className="w-full resize-none bg-transparent px-5 pb-12 pt-4 text-sm text-text-primary placeholder:text-text-muted/60 focus:outline-none sm:text-base"
            />

            <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-4 py-2.5">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="rounded-lg p-1.5 text-text-muted/50 transition hover:bg-bg-elevated/60 hover:text-text-secondary"
                  aria-label="Attach file"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 5v14" />
                    <path d="M5 12h14" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="rounded-lg p-1.5 text-text-muted/50 transition hover:bg-bg-elevated/60 hover:text-text-secondary"
                  aria-label="Chat history"
                  onClick={() => router.push("/chat")}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                </button>
              </div>

              <button
                type="button"
                onClick={submitChat}
                disabled={!chatInput.trim()}
                className="flex size-8 items-center justify-center rounded-full bg-ai-blue/90 text-white shadow-sm transition-all hover:bg-ai-blue disabled:opacity-30 disabled:hover:bg-ai-blue/90"
                aria-label="Send"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 12h14" />
                  <path d="m12 5 7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: firstName ? 0.5 : 0.7, duration: 0.5 }}
            className="mt-2 text-center text-[11px] text-text-muted/40"
          >
            AI can make mistakes. Please check important information.
          </motion.p>
        </motion.div>

        {/* Suggestion pills */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.5,
            delay: firstName ? 0.45 : 0.65,
            ease: [0.25, 0.1, 0.25, 1],
          }}
          className="mt-5 flex flex-wrap justify-center gap-2.5 pointer-events-auto"
        >
          {suggestionPills.map((pill) => (
            <button
              key={pill.label}
              type="button"
              onClick={() => handlePillClick(pill.prompt)}
              className="flex items-center gap-1.5 rounded-full border border-border/40 bg-bg-elevated/30 px-4 py-2 text-xs font-medium text-text-secondary backdrop-blur-sm transition-all duration-200 hover:border-ai-blue/30 hover:bg-bg-elevated/50 hover:text-text-primary"
            >
              <PillIcon name={pill.icon} />
              {pill.label}
            </button>
          ))}
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
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Install                                                            */
/* ------------------------------------------------------------------ */

function InstallSection() {
  const [copied, setCopied] = useState(false);
  const cmd = "curl -fsSL https://broomva.tech/api/install | bash";

  const copy = useCallback(() => {
    navigator.clipboard.writeText(cmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [cmd]);

  return (
    <section className="mt-16 sm:mt-20">
      <ScrollReveal>
        <div className="glass rounded-3xl p-6 sm:p-10">
          <p className="text-xs uppercase tracking-[0.25em] text-ai-blue">
            Get Started
          </p>
          <h2 className="mt-3 font-display text-3xl text-text-primary sm:text-4xl">
            Install
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-text-secondary sm:text-base">
            One command installs the Broomva CLI, the broomva.tech skill, and
            the full bstack (24 agent skills across 7 layers).
          </p>

          <div className="mt-6">
            <button
              type="button"
              onClick={copy}
              className="group glass-card flex w-full items-center justify-between gap-4 px-5 py-4 text-left font-mono transition hover:border-ai-blue/40"
            >
              <code className="text-sm text-text-primary sm:text-base">
                <span className="text-text-muted">$ </span>
                {cmd}
              </code>
              <span className="shrink-0 text-xs text-text-muted transition group-hover:text-ai-blue">
                {copied ? "Copied!" : "Copy"}
              </span>
            </button>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <span className="rounded-full border border-border/40 px-3 py-1 text-xs text-text-muted">
              cargo install broomva
            </span>
            <a
              href="https://crates.io/crates/broomva"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-border/40 px-3 py-1 text-xs text-text-muted transition hover:border-ai-blue/50 hover:text-ai-blue"
            >
              crates.io
            </a>
            <a
              href="https://github.com/broomva/broomva.tech/tree/main/crates/broomva-cli"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-border/40 px-3 py-1 text-xs text-text-muted transition hover:border-ai-blue/50 hover:text-ai-blue"
            >
              Source
            </a>
          </div>
        </div>
      </ScrollReveal>
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
            10 Rust crates, 24 agent skills, 500+ tests. A control-theory-native
            ecosystem for autonomous software development.
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

