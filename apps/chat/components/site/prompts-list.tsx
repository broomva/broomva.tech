"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { motion } from "motion/react";
import Link from "next/link";
import type { ContentSummary } from "@/lib/content";
import { formatDate } from "@/lib/date";

const COLLAPSED_ROWS = 2;

interface PromptsListProps {
  entries: ContentSummary[];
}

export function PromptsList({ entries }: PromptsListProps) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [tagsExpanded, setTagsExpanded] = useState(false);
  const [needsCollapse, setNeedsCollapse] = useState(false);
  const [collapsedHeight, setCollapsedHeight] = useState<number | null>(null);
  const navRef = useRef<HTMLDivElement>(null);

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of entries) {
      if (e.category) counts.set(e.category, (counts.get(e.category) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([cat, count]) => ({ cat, count }));
  }, [entries]);

  const allTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of entries) {
      for (const t of e.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([tag, count]) => ({ tag, count }));
  }, [entries]);

  const tagCount = allTags.length;
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-measure DOM layout when tag buttons change
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const buttons = Array.from(
      nav.querySelectorAll<HTMLButtonElement>("button"),
    );
    if (buttons.length < 2) return;
    const firstTop = buttons[0].offsetTop;
    let rowCount = 1;
    let lastRowStart = 0;
    for (let i = 1; i < buttons.length; i++) {
      if (buttons[i].offsetTop > buttons[i - 1].offsetTop) {
        rowCount++;
        if (rowCount === COLLAPSED_ROWS + 1) lastRowStart = i;
      }
    }
    if (rowCount > COLLAPSED_ROWS) {
      setNeedsCollapse(true);
      const cutoffButton = buttons[lastRowStart];
      setCollapsedHeight(cutoffButton.offsetTop - firstTop);
    } else {
      setNeedsCollapse(false);
    }
  }, [tagCount]);

  const filtered = useMemo(() => {
    let result = entries;
    if (activeCategory) result = result.filter((e) => e.category === activeCategory);
    if (activeTag) result = result.filter((e) => e.tags.includes(activeTag));
    return result;
  }, [entries, activeCategory, activeTag]);

  const featured = filtered[0];
  const rest = filtered.slice(1);

  const pillClass = (active: boolean) =>
    `rounded-full border px-3.5 py-1.5 text-xs font-medium tracking-wide backdrop-blur-sm transition-all duration-200 ${
      active
        ? "border-ai-blue/40 bg-ai-blue/12 text-ai-blue shadow-[0_0_12px_oklch(0.60_0.12_260/0.08)]"
        : "border-border/40 bg-bg-elevated/30 text-text-muted hover:border-border/60 hover:text-text-secondary"
    }`;

  return (
    <>
      {/* Category filter */}
      {categories.length > 0 && (
        <div className="mt-8 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveCategory(null)}
            className={pillClass(!activeCategory)}
          >
            All categories{" "}
            <span className="ml-1 text-[10px] opacity-60">
              {entries.length}
            </span>
          </button>
          {categories.map(({ cat, count }) => (
            <button
              key={cat}
              type="button"
              onClick={() =>
                setActiveCategory(activeCategory === cat ? null : cat)
              }
              className={pillClass(activeCategory === cat)}
            >
              {cat}
              <span className="ml-1 text-[10px] opacity-60">{count}</span>
            </button>
          ))}
        </div>
      )}

      {/* Tag filter */}
      {allTags.length > 0 && (
        <div className="mt-4">
          <motion.nav
            ref={navRef}
            className="relative flex flex-wrap gap-2 overflow-hidden"
            aria-label="Filter by tag"
            animate={{
              height:
                needsCollapse && !tagsExpanded && collapsedHeight != null
                  ? collapsedHeight
                  : "auto",
            }}
            transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
          >
            <button
              type="button"
              onClick={() => setActiveTag(null)}
              className={pillClass(!activeTag)}
            >
              All tags
            </button>
            {allTags.map(({ tag, count }) => (
              <button
                key={tag}
                type="button"
                onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                className={pillClass(activeTag === tag)}
              >
                {tag}
                <span className="ml-1 text-[10px] opacity-60">{count}</span>
              </button>
            ))}
            {needsCollapse && !tagsExpanded && (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-bg-deep to-transparent" />
            )}
          </motion.nav>
          {needsCollapse && (
            <button
              type="button"
              onClick={() => setTagsExpanded((v) => !v)}
              className="mt-2 flex items-center gap-1.5 text-xs text-text-muted/60 transition-colors hover:text-text-secondary"
            >
              <motion.svg
                xmlns="http://www.w3.org/2000/svg"
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                animate={{ rotate: tagsExpanded ? 180 : 0 }}
                transition={{ duration: 0.2 }}
              >
                <polyline points="6 9 12 15 18 9" />
              </motion.svg>
              {tagsExpanded
                ? "Show fewer tags"
                : `Show all ${allTags.length} tags`}
            </button>
          )}
        </div>
      )}

      {/* Count */}
      <p className="mt-6 text-xs text-text-muted/60">
        {filtered.length} prompt{filtered.length !== 1 ? "s" : ""}
        {activeCategory ? ` in "${activeCategory}"` : ""}
        {activeTag ? ` tagged "${activeTag}"` : ""}
      </p>

      <motion.div
        key={`${activeCategory ?? "__all__"}-${activeTag ?? "__all__"}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25 }}
      >
        {/* Featured prompt */}
        {featured && (
          <Link
            href={`/prompts/${featured.slug}`}
            className="glass-card group mt-6 block overflow-hidden p-0"
          >
            <div className="h-px bg-gradient-to-r from-transparent via-ai-blue/40 to-transparent" />
            <div className="px-5 py-6 sm:px-7 sm:py-8">
              <div className="flex items-center gap-3 text-xs text-text-muted">
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ai-blue/60">
                  Latest
                </span>
                <span className="h-px flex-1 bg-border/30" />
                {featured.version && (
                  <span className="font-mono text-[10px] text-text-muted/70">
                    v{featured.version}
                  </span>
                )}
                <span className="uppercase tracking-[0.14em]">
                  {formatDate(featured.date)}
                </span>
              </div>
              <h2 className="mt-4 font-display text-2xl text-text-primary transition-colors group-hover:text-ai-blue sm:text-3xl">
                {featured.title}
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-relaxed text-text-secondary sm:text-base">
                {featured.summary}
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-2">
                {featured.category && (
                  <span className="rounded-full border border-ai-blue/30 bg-ai-blue/8 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.15em] text-ai-blue/80">
                    {featured.category}
                  </span>
                )}
                {featured.model && (
                  <span className="rounded-full border border-accent-blue/30 bg-accent-blue/8 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.15em] text-accent-blue/80">
                    {featured.model}
                  </span>
                )}
                {featured.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-border/30 px-2.5 py-0.5 text-[10px] uppercase tracking-[0.15em] text-text-muted/70"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </Link>
        )}

        {/* Empty state */}
        {filtered.length === 0 && (
          <p className="mt-10 text-center text-sm text-text-muted">
            No prompts found.
          </p>
        )}

        {/* Grid */}
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {rest.map((entry, i) => (
            <motion.div
              key={entry.slug}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: i * 0.04,
                duration: 0.35,
                ease: [0.25, 0.1, 0.25, 1],
              }}
            >
              <Link
                href={`/prompts/${entry.slug}`}
                className="glass-card group block h-full overflow-hidden p-0"
              >
                <div className="px-5 py-5">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-display text-lg text-text-primary transition-colors group-hover:text-ai-blue">
                      {entry.title}
                    </h3>
                    {entry.version && (
                      <span className="shrink-0 rounded border border-border/30 bg-bg-elevated/40 px-1.5 py-0.5 font-mono text-[10px] text-text-muted/70">
                        v{entry.version}
                      </span>
                    )}
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-text-secondary">
                    {entry.summary}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {entry.category && (
                      <span className="rounded-full border border-ai-blue/20 bg-ai-blue/8 px-2 py-0.5 text-[10px] font-medium text-ai-blue/70">
                        {entry.category}
                      </span>
                    )}
                    {entry.tags.slice(0, 2).map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full border border-border/20 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-text-muted/60"
                      >
                        {tag}
                      </span>
                    ))}
                    {entry.tags.length > 2 && (
                      <span className="px-1 text-[10px] text-text-muted/40">
                        +{entry.tags.length - 2}
                      </span>
                    )}
                  </div>
                  <div className="mt-3 flex items-center gap-2 text-xs text-text-muted">
                    <span className="uppercase tracking-[0.14em]">
                      {formatDate(entry.date)}
                    </span>
                    {entry.model && (
                      <>
                        <span className="text-border/60">&middot;</span>
                        <span className="font-mono text-[10px] text-accent-blue/60">
                          {entry.model}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </>
  );
}
