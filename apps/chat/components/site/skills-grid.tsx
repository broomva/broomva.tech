"use client";

import { useState, useMemo } from "react";
import { motion } from "motion/react";
import type { BstackLayer, BstackSkill } from "@/lib/skills-data";

function SkillCard({ skill, index }: { skill: BstackSkill; index: number }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(skill.installCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        delay: index * 0.04,
        duration: 0.35,
        ease: [0.25, 0.1, 0.25, 1],
      }}
    >
      <div className="glass-card group flex h-full flex-col overflow-hidden p-0">
        <div className="flex flex-1 flex-col px-5 py-5">
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
              className="flex-1 truncate rounded-md border border-border/20 bg-bg-elevated/30 px-3 py-1.5 text-left font-mono text-xs text-text-secondary backdrop-blur-sm transition hover:border-border/40 hover:bg-bg-elevated/50"
              title={skill.installCommand}
            >
              {copied ? (
                <span className="text-accent-blue">Copied!</span>
              ) : (
                skill.installCommand
              )}
            </button>
            <a
              href={skill.skillsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 rounded-md border border-border/20 px-2.5 py-1.5 text-xs text-ai-blue/70 backdrop-blur-sm transition hover:border-ai-blue/30 hover:text-ai-blue"
            >
              View
            </a>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export function SkillsGrid({ layers }: { layers: BstackLayer[] }) {
  const [activeLayer, setActiveLayer] = useState<string | null>(null);

  const totalSkills = useMemo(
    () => layers.reduce((sum, l) => sum + l.skills.length, 0),
    [layers],
  );

  const filteredLayers = useMemo(() => {
    if (!activeLayer) return layers;
    return layers.filter((l) => l.id === activeLayer);
  }, [layers, activeLayer]);

  const filteredCount = filteredLayers.reduce(
    (sum, l) => sum + l.skills.length,
    0,
  );

  const pillClass = (active: boolean) =>
    `rounded-full border px-3.5 py-1.5 text-xs font-medium tracking-wide backdrop-blur-sm transition-all duration-200 ${
      active
        ? "border-ai-blue/40 bg-ai-blue/12 text-ai-blue shadow-[0_0_12px_oklch(0.60_0.12_260/0.08)]"
        : "border-border/40 bg-bg-elevated/30 text-text-muted hover:border-border/60 hover:text-text-secondary"
    }`;

  return (
    <>
      {/* Layer filter */}
      <div className="mt-8 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setActiveLayer(null)}
          className={pillClass(!activeLayer)}
        >
          All layers{" "}
          <span className="ml-1 text-[10px] opacity-60">{totalSkills}</span>
        </button>
        {layers.map((layer) => (
          <button
            key={layer.id}
            type="button"
            onClick={() =>
              setActiveLayer(activeLayer === layer.id ? null : layer.id)
            }
            className={pillClass(activeLayer === layer.id)}
          >
            {layer.name}
            <span className="ml-1 text-[10px] opacity-60">
              {layer.skills.length}
            </span>
          </button>
        ))}
      </div>

      {/* Count */}
      <p className="mt-6 text-xs text-text-muted/60">
        {filteredCount} skill{filteredCount !== 1 ? "s" : ""}
        {activeLayer
          ? ` in ${layers.find((l) => l.id === activeLayer)?.name ?? activeLayer}`
          : ` across ${layers.length} layers`}
      </p>

      <motion.div
        key={activeLayer ?? "__all__"}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25 }}
        className="mt-6 space-y-14"
      >
        {filteredLayers.map((layer) => (
          <section key={layer.id}>
            <div className="mb-5 flex items-center gap-4">
              <span className="font-mono text-xs uppercase tracking-[0.25em] text-ai-blue/60">
                {layer.name}
              </span>
              <span className="h-px flex-1 bg-border/20" />
              <span className="text-[10px] text-text-muted/40">
                {layer.skills.length}
              </span>
            </div>
            <p className="mb-6 max-w-2xl text-sm leading-relaxed text-text-secondary">
              {layer.description}
            </p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {layer.skills.map((skill, i) => (
                <SkillCard key={skill.slug} skill={skill} index={i} />
              ))}
            </div>
          </section>
        ))}
      </motion.div>
    </>
  );
}
