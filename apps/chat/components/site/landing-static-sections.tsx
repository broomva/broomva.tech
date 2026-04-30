import type { Route } from "next";
import Link from "next/link";
import { ContentCard } from "@/components/site/content-card";
import { ScrollReveal } from "@/components/site/scroll-reveal";
import type { ContentSummary } from "@/lib/content";
import { formatDate } from "@/lib/date";

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
    demoHref: "/life",
    demoLabel: "Try the live demo →",
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

export function StackSection() {
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
                <div className="flex h-full flex-col gap-2">
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
                  {item.demoHref && (
                    <Link
                      href={item.demoHref as Route}
                      className="inline-flex items-center gap-1.5 self-start rounded-full border border-ai-blue/25 bg-ai-blue/5 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-ai-blue/80 transition hover:border-ai-blue/60 hover:bg-ai-blue/10 hover:text-ai-blue"
                    >
                      {item.demoLabel ?? "Live demo →"}
                    </Link>
                  )}
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </ScrollReveal>
    </section>
  );
}

export function ContentSection({
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
                meta={
                  entry.readingTime
                    ? `${formatDate(entry.date)} · ${entry.readingTime} min read`
                    : formatDate(entry.date)
                }
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
