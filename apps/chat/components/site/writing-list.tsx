"use client";

import { useState, useMemo } from "react";
import { motion } from "motion/react";
import Link from "next/link";
import type { ContentSummary } from "@/lib/content";
import { formatDate } from "@/lib/date";

interface WritingListProps {
  entries: ContentSummary[];
}

export function WritingList({ entries }: WritingListProps) {
  const [activeTag, setActiveTag] = useState<string | null>(null);

  const allTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of entries) {
      for (const t of e.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([tag, count]) => ({ tag, count }));
  }, [entries]);

  const filtered = useMemo(() => {
    if (!activeTag) return entries;
    return entries.filter((e) => e.tags.includes(activeTag));
  }, [entries, activeTag]);

  const featured = filtered[0];
  const rest = filtered.slice(1);

  const yearGroups = useMemo(() => {
    const groups: { year: number; items: ContentSummary[] }[] = [];
    for (const entry of rest) {
      const year = new Date(entry.date).getFullYear();
      const last = groups[groups.length - 1];
      if (last?.year === year) {
        last.items.push(entry);
      } else {
        groups.push({ year, items: [entry] });
      }
    }
    return groups;
  }, [rest]);

  return (
    <>
      {/* Tag filter */}
      <nav
        className="mt-8 flex flex-wrap gap-2"
        aria-label="Filter by topic"
      >
        <button
          type="button"
          onClick={() => setActiveTag(null)}
          className={`rounded-full border px-3.5 py-1.5 text-xs font-medium tracking-wide backdrop-blur-sm transition-all duration-200 ${
            !activeTag
              ? "border-ai-blue/40 bg-ai-blue/12 text-ai-blue shadow-[0_0_12px_oklch(0.60_0.12_260/0.08)]"
              : "border-border/40 bg-bg-elevated/30 text-text-muted hover:border-border/60 hover:text-text-secondary"
          }`}
        >
          All{" "}
          <span className="ml-1 text-[10px] opacity-60">{entries.length}</span>
        </button>
        {allTags.map(({ tag, count }) => (
          <button
            key={tag}
            type="button"
            onClick={() => setActiveTag(activeTag === tag ? null : tag)}
            className={`rounded-full border px-3.5 py-1.5 text-xs font-medium tracking-wide backdrop-blur-sm transition-all duration-200 ${
              activeTag === tag
                ? "border-ai-blue/40 bg-ai-blue/12 text-ai-blue shadow-[0_0_12px_oklch(0.60_0.12_260/0.08)]"
                : "border-border/40 bg-bg-elevated/30 text-text-muted hover:border-border/60 hover:text-text-secondary"
            }`}
          >
            {tag}
            <span className="ml-1 text-[10px] opacity-60">{count}</span>
          </button>
        ))}
      </nav>

      {/* Post count */}
      <p className="mt-6 text-xs text-text-muted/60">
        {filtered.length} post{filtered.length !== 1 ? "s" : ""}
        {activeTag ? ` tagged "${activeTag}"` : ""}
      </p>

      <motion.div
        key={activeTag ?? "__all__"}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25 }}
      >
        {/* Featured card */}
        {featured && (
          <Link
            href={`/writing/${featured.slug}`}
            className="glass-card group mt-6 block overflow-hidden p-0"
          >
            <div className="h-px bg-gradient-to-r from-transparent via-ai-blue/40 to-transparent" />
            <div className="px-5 py-6 sm:px-7 sm:py-8">
              <div className="flex items-center gap-3 text-xs text-text-muted">
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ai-blue/60">
                  Latest
                </span>
                <span className="h-px flex-1 bg-border/30" />
                <span className="uppercase tracking-[0.14em]">
                  {formatDate(featured.date)}
                </span>
                {featured.readingTime != null && (
                  <>
                    <span className="text-border/60">&middot;</span>
                    <span>{featured.readingTime} min read</span>
                  </>
                )}
              </div>

              <h2 className="mt-4 font-display text-2xl text-text-primary transition-colors group-hover:text-ai-blue sm:text-3xl">
                {featured.title}
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-relaxed text-text-secondary sm:text-base">
                {featured.summary}
              </p>

              {featured.tags.length > 0 && (
                <div className="mt-5 flex flex-wrap gap-2">
                  {featured.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-border/30 px-2.5 py-0.5 text-[10px] uppercase tracking-[0.15em] text-text-muted/70"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </Link>
        )}

        {/* Empty state */}
        {filtered.length === 0 && (
          <p className="mt-10 text-center text-sm text-text-muted">
            No posts found.
          </p>
        )}

        {/* Year-grouped remaining posts */}
        {yearGroups.map(({ year, items }) => (
          <section key={year} className="mt-12">
            <div className="mb-5 flex items-center gap-4">
              <span className="font-mono text-sm tracking-wide text-text-muted/50">
                {year}
              </span>
              <span className="h-px flex-1 bg-border/20" />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {items.map((entry, i) => (
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
                    href={`/writing/${entry.slug}`}
                    className="glass-card group block h-full"
                  >
                    <h3 className="font-display text-lg text-text-primary transition-colors group-hover:text-ai-blue">
                      {entry.title}
                    </h3>
                    <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-text-secondary">
                      {entry.summary}
                    </p>
                    <div className="mt-4 flex items-center gap-2 text-xs text-text-muted">
                      <span className="uppercase tracking-[0.14em]">
                        {formatDate(entry.date)}
                      </span>
                      {entry.readingTime != null && (
                        <>
                          <span className="text-border/60">&middot;</span>
                          <span>{entry.readingTime} min</span>
                        </>
                      )}
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          </section>
        ))}
      </motion.div>
    </>
  );
}
