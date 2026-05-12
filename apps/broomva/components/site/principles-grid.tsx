"use client";

import { ScrollReveal } from "@/components/site/scroll-reveal";

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

export function PrinciplesGrid() {
  return (
    <section>
      <ScrollReveal>
        <p className="text-xs uppercase tracking-[0.25em] text-ai-blue">
          How I build
        </p>
        <h2 className="mt-3 font-display text-3xl text-text-primary sm:text-4xl">
          The throughline across all work
        </h2>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-text-secondary sm:text-base">
          Whether it&apos;s a Databricks pipeline, an agent runtime, or a
          breath-hold training block — the same six principles apply.
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
