"use client";

import { useState } from "react";
import { ScrollReveal } from "@/components/site/scroll-reveal";
import type { BstackLayer, BstackSkill } from "@/lib/skills-data";

function SkillCard({ skill, index }: { skill: BstackSkill; index: number }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(skill.installCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <ScrollReveal delay={index * 0.06}>
      <div className="glass-card group flex h-full flex-col">
        <h3 className="font-display text-base text-text-primary">
          {skill.name}
        </h3>
        <p className="mt-2 flex-1 text-sm leading-relaxed text-text-muted">
          {skill.description}
        </p>
        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={copy}
            className="flex-1 truncate rounded-md bg-white/5 px-3 py-1.5 text-left font-mono text-xs text-text-secondary transition hover:bg-white/10"
            title={skill.installCommand}
          >
            {copied ? "Copied!" : skill.installCommand}
          </button>
          <a
            href={skill.skillsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-xs text-ai-blue/70 transition hover:text-ai-blue"
          >
            View
          </a>
        </div>
      </div>
    </ScrollReveal>
  );
}

export function SkillsGrid({ layers }: { layers: BstackLayer[] }) {
  return (
    <div className="mt-10 space-y-14">
      {layers.map((layer) => (
        <section key={layer.id}>
          <ScrollReveal>
            <p className="text-xs uppercase tracking-[0.25em] text-ai-blue">
              {layer.name}
            </p>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-text-secondary">
              {layer.description}
            </p>
          </ScrollReveal>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {layer.skills.map((skill, i) => (
              <SkillCard key={skill.slug} skill={skill} index={i} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
