"use client";

import { useCallback, useMemo, useState } from "react";
import type { ContentSummary } from "@/lib/content";
import { PromptCard } from "./prompt-card";
import { formatDate } from "@/lib/date";

interface CategoryFilterProps {
  entries: ContentSummary[];
}

export function CategoryFilter({ entries }: CategoryFilterProps) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const categories = useMemo(() => {
    const cats = new Set<string>();
    for (const entry of entries) {
      if (entry.category) cats.add(entry.category);
    }
    return Array.from(cats).sort();
  }, [entries]);

  const filtered = useMemo(
    () =>
      activeCategory
        ? entries.filter((e) => e.category === activeCategory)
        : entries,
    [entries, activeCategory],
  );

  const handleClick = useCallback(
    (cat: string) => {
      setActiveCategory((prev) => (prev === cat ? null : cat));
    },
    [],
  );

  return (
    <>
      {categories.length > 0 ? (
        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveCategory(null)}
            className={[
              "rounded-full px-3 py-1.5 text-xs font-medium transition",
              activeCategory === null
                ? "bg-ai-blue/15 text-ai-blue"
                : "bg-zinc-800/50 text-text-muted hover:text-text-primary",
            ].join(" ")}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => handleClick(cat)}
              className={[
                "rounded-full px-3 py-1.5 text-xs font-medium transition",
                activeCategory === cat
                  ? "bg-ai-blue/15 text-ai-blue"
                  : "bg-zinc-800/50 text-text-muted hover:text-text-primary",
              ].join(" ")}
            >
              {cat}
            </button>
          ))}
        </div>
      ) : null}

      <section className="mt-8 grid gap-4 md:grid-cols-2">
        {filtered.map((entry) => (
          <PromptCard
            key={entry.slug}
            title={entry.title}
            summary={entry.summary}
            href={`/prompts/${entry.slug}`}
            category={entry.category}
            version={entry.version}
            model={entry.model}
            tags={entry.tags}
            meta={formatDate(entry.date)}
          />
        ))}
      </section>
    </>
  );
}
