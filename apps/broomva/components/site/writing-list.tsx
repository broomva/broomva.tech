"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { motion } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import type { ContentSummary } from "@/lib/content";
import { formatDate } from "@/lib/date";

const COLLAPSED_ROWS = 2;

const SPANISH_TAGS = new Set([
  "colombia",
  "industry-4-0",
]);
const SPANISH_SLUG_HINTS = [
  "inteligencia-artificial",
  "iiot-from-edge",
  "iiot-as-a-service",
];

function detectLanguage(entry: ContentSummary): "ES" | "EN" {
  if (SPANISH_TAGS.size > 0 && entry.tags.some((t) => SPANISH_TAGS.has(t)))
    return "ES";
  if (SPANISH_SLUG_HINTS.some((h) => entry.slug.includes(h))) return "ES";
  // Check if summary starts with Spanish characters/words
  if (/^(Desde|Mediante|Arquitectura|Modelos)/i.test(entry.summary))
    return "ES";
  return "EN";
}

function isVideo(src: string) {
  return /\.(mp4|webm)$/i.test(src);
}

function PostThumbnail({
  src,
  alt,
  className = "",
  sizes,
}: {
  src: string;
  alt: string;
  className?: string;
  sizes?: string;
}) {
  if (isVideo(src)) {
    return (
      <video
        src={src}
        muted
        loop
        playsInline
        autoPlay
        className={className}
      />
    );
  }
  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes ?? "(max-width: 768px) 100vw, 50vw"}
      className={className}
    />
  );
}

interface WritingListProps {
  entries: ContentSummary[];
}

export function WritingList({ entries }: WritingListProps) {
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [tagsExpanded, setTagsExpanded] = useState(false);
  const [needsCollapse, setNeedsCollapse] = useState(false);
  const [collapsedHeight, setCollapsedHeight] = useState<number | null>(null);
  const navRef = useRef<HTMLDivElement>(null);

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
        if (rowCount === COLLAPSED_ROWS + 1) {
          lastRowStart = i;
        }
      }
    }

    if (rowCount > COLLAPSED_ROWS) {
      setNeedsCollapse(true);
      const cutoffButton = buttons[lastRowStart];
      const height = cutoffButton.offsetTop - firstTop;
      setCollapsedHeight(height);
    } else {
      setNeedsCollapse(false);
    }
  }, [tagCount]);

  const filtered = useMemo(() => {
    if (!activeTag) return entries;
    return entries.filter((e) => e.tags.includes(activeTag));
  }, [entries, activeTag]);

  // Prefer pinned post as featured, otherwise latest
  const pinnedIdx = filtered.findIndex((e) => e.pinned);
  const featured = pinnedIdx >= 0 ? filtered[pinnedIdx] : filtered[0];
  const rest = filtered.filter((e) => e !== featured);

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
      <div className="mt-8">
        <motion.nav
          ref={navRef}
          className="relative flex flex-wrap gap-2 overflow-hidden"
          aria-label="Filter by topic"
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
            className={`rounded-full border px-3.5 py-1.5 text-xs font-medium tracking-wide backdrop-blur-sm transition-all duration-200 ${
              !activeTag
                ? "border-ai-blue/40 bg-ai-blue/12 text-ai-blue shadow-[0_0_12px_oklch(0.60_0.12_260/0.08)]"
                : "border-border/40 bg-bg-elevated/30 text-text-muted hover:border-border/60 hover:text-text-secondary"
            }`}
          >
            All{" "}
            <span className="ml-1 text-[10px] opacity-60">
              {entries.length}
            </span>
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
              ? "Show fewer topics"
              : `Show all ${allTags.length} topics`}
          </button>
        )}
      </div>

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
            {featured.image && (
              <div className="relative aspect-[2.4/1] w-full overflow-hidden bg-bg-elevated/30">
                <PostThumbnail
                  src={featured.image}
                  alt={featured.title}
                  sizes="(max-width: 768px) 100vw, 1104px"
                  className={
                    isVideo(featured.image)
                      ? "h-full w-full object-cover"
                      : "object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                  }
                />
                <div className="absolute inset-0 bg-gradient-to-t from-bg-deep/80 via-bg-deep/20 to-transparent" />
              </div>
            )}
            <div className="px-5 py-6 sm:px-7 sm:py-8">
              <div className="flex items-center gap-3 text-xs text-text-muted">
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ai-blue/60">
                  {featured.pinned ? "Featured" : "Latest"}
                </span>
                {detectLanguage(featured) === "ES" && (
                  <span className="rounded border border-accent-blue/30 bg-accent-blue/8 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.2em] text-accent-blue/80">
                    ES
                  </span>
                )}
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
                    className="glass-card group block h-full overflow-hidden p-0"
                  >
                    {entry.image && (
                      <div className="relative aspect-[2/1] w-full overflow-hidden bg-bg-elevated/30">
                        <PostThumbnail
                          src={entry.image}
                          alt={entry.title}
                          className={
                            isVideo(entry.image)
                              ? "h-full w-full object-cover"
                              : "object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                          }
                        />
                      </div>
                    )}
                    <div className="px-5 py-5">
                      <h3 className="font-display text-lg text-text-primary transition-colors group-hover:text-ai-blue">
                        {entry.title}
                      </h3>
                      <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-text-secondary">
                        {entry.summary}
                      </p>
                      {entry.tags.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {entry.tags.slice(0, 3).map((tag) => (
                            <span
                              key={tag}
                              className="rounded-full border border-border/20 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-text-muted/60"
                            >
                              {tag}
                            </span>
                          ))}
                          {entry.tags.length > 3 && (
                            <span className="px-1 text-[10px] text-text-muted/40">
                              +{entry.tags.length - 3}
                            </span>
                          )}
                        </div>
                      )}
                      <div className="mt-3 flex items-center gap-2 text-xs text-text-muted">
                        <span className="uppercase tracking-[0.14em]">
                          {formatDate(entry.date)}
                        </span>
                        {entry.readingTime != null && (
                          <>
                            <span className="text-border/60">&middot;</span>
                            <span>{entry.readingTime} min</span>
                          </>
                        )}
                        {detectLanguage(entry) === "ES" && (
                          <>
                            <span className="text-border/60">&middot;</span>
                            <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-accent-blue/70">
                              ES
                            </span>
                          </>
                        )}
                      </div>
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
