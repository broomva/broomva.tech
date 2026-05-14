"use client";

import { useState, useMemo } from "react";
import { motion } from "motion/react";
import type { BstackLayer, BstackSkill } from "@/lib/skills-data";

function relativeDate(iso?: string): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  const now = Date.now();
  const days = Math.floor((now - then) / 86400000);
  if (days < 1) return "today";
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months === 1) return "1 month ago";
  if (months < 12) return `${months} months ago`;
  const years = Math.floor(months / 12);
  return years === 1 ? "1 year ago" : `${years} years ago`;
}

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
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="font-display text-base text-text-primary">
              {skill.name}
            </h3>
            {typeof skill.stars === "number" && skill.stars > 0 ? (
              <span className="shrink-0 font-mono text-[10px] text-text-muted/60">
                ★ {skill.stars}
              </span>
            ) : null}
          </div>
          {skill.updatedAt ? (
            <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-text-muted/40">
              updated {relativeDate(skill.updatedAt)}
            </p>
          ) : null}
          <p className="mt-2 flex-1 text-sm leading-relaxed text-text-muted">
            {skill.description}
          </p>
          {skill.topics && skill.topics.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1">
              {skill.topics.slice(0, 4).map((t) => (
                <span
                  key={t}
                  className="rounded border border-border/20 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-text-muted/60"
                >
                  {t}
                </span>
              ))}
            </div>
          ) : null}
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
            {skill.repoUrl ? (
              <a
                href={skill.repoUrl}
                target="_blank"
                rel="noopener noreferrer"
                title="View on GitHub"
                className="shrink-0 rounded-md border border-border/20 px-2.5 py-1.5 text-xs text-text-secondary backdrop-blur-sm transition hover:border-border/40 hover:text-text-primary"
              >
                GH
              </a>
            ) : null}
            <a
              href={skill.skillsUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="View on skills.sh"
              className="shrink-0 rounded-md border border-border/20 px-2.5 py-1.5 text-xs text-ai-blue/70 backdrop-blur-sm transition hover:border-ai-blue/30 hover:text-ai-blue"
            >
              skills.sh
            </a>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function SkillRow({ skill }: { skill: BstackSkill }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(skill.installCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="grid grid-cols-12 items-center gap-3 border-b border-border/10 px-4 py-3 transition hover:bg-bg-elevated/20">
      <div className="col-span-12 sm:col-span-4">
        <div className="flex items-baseline gap-2">
          <span className="font-display text-sm text-text-primary">{skill.name}</span>
          {typeof skill.stars === "number" && skill.stars > 0 ? (
            <span className="font-mono text-[10px] text-text-muted/60">★ {skill.stars}</span>
          ) : null}
        </div>
        {skill.updatedAt ? (
          <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted/40">
            {relativeDate(skill.updatedAt)}
          </span>
        ) : null}
      </div>
      <p className="col-span-12 text-xs text-text-muted sm:col-span-5">
        {skill.description}
      </p>
      <div className="col-span-12 flex items-center gap-1.5 sm:col-span-3 sm:justify-end">
        <button
          type="button"
          onClick={copy}
          className="rounded border border-border/20 bg-bg-elevated/30 px-2 py-1 font-mono text-[10px] text-text-secondary hover:border-border/40"
          title={skill.installCommand}
        >
          {copied ? "Copied!" : "npx"}
        </button>
        {skill.repoUrl ? (
          <a
            href={skill.repoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded border border-border/20 px-2 py-1 text-[10px] text-text-secondary hover:border-border/40"
          >
            GH
          </a>
        ) : null}
        <a
          href={skill.skillsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded border border-border/20 px-2 py-1 text-[10px] text-ai-blue/70 hover:border-ai-blue/30"
        >
          skills.sh
        </a>
      </div>
    </div>
  );
}

export function SkillsGrid({ layers }: { layers: BstackLayer[] }) {
  const [activeLayer, setActiveLayer] = useState<string | null>(null);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [query, setQuery] = useState("");

  const totalSkills = useMemo(
    () => layers.reduce((sum, l) => sum + l.skills.length, 0),
    [layers],
  );

  const filteredLayers = useMemo(() => {
    const q = query.trim().toLowerCase();
    return layers
      .filter((l) => (activeLayer ? l.id === activeLayer : true))
      .map((l) => ({
        ...l,
        skills: q
          ? l.skills.filter(
              (s) =>
                s.name.toLowerCase().includes(q) ||
                s.description.toLowerCase().includes(q) ||
                s.slug.toLowerCase().includes(q) ||
                (s.topics ?? []).some((t) => t.toLowerCase().includes(q)),
            )
          : l.skills,
      }))
      .filter((l) => l.skills.length > 0);
  }, [layers, activeLayer, query]);

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
      {/* Search + view toggle */}
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <input
          type="search"
          placeholder="Search skills, topics, descriptions…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 min-w-[200px] rounded-md border border-border/30 bg-bg-elevated/30 px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted/40 backdrop-blur-sm transition focus:border-ai-blue/40 focus:outline-none"
        />
        <div className="flex gap-1 rounded-md border border-border/30 bg-bg-elevated/30 p-0.5 backdrop-blur-sm">
          <button
            type="button"
            onClick={() => setView("grid")}
            className={`rounded px-2.5 py-1 text-xs transition ${
              view === "grid"
                ? "bg-ai-blue/15 text-ai-blue"
                : "text-text-muted hover:text-text-secondary"
            }`}
          >
            Grid
          </button>
          <button
            type="button"
            onClick={() => setView("list")}
            className={`rounded px-2.5 py-1 text-xs transition ${
              view === "list"
                ? "bg-ai-blue/15 text-ai-blue"
                : "text-text-muted hover:text-text-secondary"
            }`}
          >
            List
          </button>
        </div>
      </div>

      {/* Layer filter */}
      <div className="mt-4 flex flex-wrap gap-2">
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
          : ` across ${filteredLayers.length} layer${filteredLayers.length !== 1 ? "s" : ""}`}
        {query ? ` matching "${query}"` : ""}
      </p>

      <motion.div
        key={`${activeLayer ?? "__all__"}::${view}::${query}`}
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
            {view === "grid" ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {layer.skills.map((skill, i) => (
                  <SkillCard key={skill.slug} skill={skill} index={i} />
                ))}
              </div>
            ) : (
              <div className="overflow-hidden rounded-lg border border-border/20 bg-bg-elevated/10 backdrop-blur-sm">
                <div className="hidden grid-cols-12 gap-3 border-b border-border/20 bg-bg-elevated/30 px-4 py-2 font-mono text-[10px] uppercase tracking-wider text-text-muted/60 sm:grid">
                  <div className="col-span-4">Skill</div>
                  <div className="col-span-5">Description</div>
                  <div className="col-span-3 text-right">Install · Links</div>
                </div>
                {layer.skills.map((skill) => (
                  <SkillRow key={skill.slug} skill={skill} />
                ))}
              </div>
            )}
          </section>
        ))}
      </motion.div>
    </>
  );
}
