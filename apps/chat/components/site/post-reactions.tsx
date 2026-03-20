"use client";

import { useCallback, useEffect, useState } from "react";

const REACTIONS = [
  { emoji: "\u{1F525}", label: "Fire", key: "fire" },
  { emoji: "\u{1F4A1}", label: "Insightful", key: "lightbulb" },
  { emoji: "\u{1F680}", label: "Rocket", key: "rocket" },
  { emoji: "\u{2764}\u{FE0F}", label: "Love", key: "heart" },
  { emoji: "\u{1F44F}", label: "Applause", key: "clap" },
] as const;

type ReactionKey = (typeof REACTIONS)[number]["key"];

function getStorageKey(slug: string) {
  return `broomva-reactions-${slug}`;
}

function loadReactions(slug: string): Record<ReactionKey, number> {
  const defaults: Record<ReactionKey, number> = {
    fire: 0,
    lightbulb: 0,
    rocket: 0,
    heart: 0,
    clap: 0,
  };
  try {
    const raw = localStorage.getItem(getStorageKey(slug));
    if (raw) return { ...defaults, ...JSON.parse(raw) };
  } catch {}
  return defaults;
}

function loadUserReactions(slug: string): Set<ReactionKey> {
  try {
    const raw = localStorage.getItem(`${getStorageKey(slug)}-user`);
    if (raw) return new Set(JSON.parse(raw));
  } catch {}
  return new Set();
}

interface PostReactionsProps {
  slug: string;
}

export function PostReactions({ slug }: PostReactionsProps) {
  const [counts, setCounts] = useState<Record<ReactionKey, number>>({
    fire: 0,
    lightbulb: 0,
    rocket: 0,
    heart: 0,
    clap: 0,
  });
  const [userReacted, setUserReacted] = useState<Set<ReactionKey>>(new Set());
  const [animated, setAnimated] = useState<ReactionKey | null>(null);

  useEffect(() => {
    setCounts(loadReactions(slug));
    setUserReacted(loadUserReactions(slug));
  }, [slug]);

  const toggle = useCallback(
    (key: ReactionKey) => {
      setCounts((prev) => {
        const alreadyReacted = userReacted.has(key);
        const next = {
          ...prev,
          [key]: alreadyReacted
            ? Math.max(0, prev[key] - 1)
            : prev[key] + 1,
        };
        localStorage.setItem(getStorageKey(slug), JSON.stringify(next));
        return next;
      });

      setUserReacted((prev) => {
        const next = new Set(prev);
        if (next.has(key)) {
          next.delete(key);
        } else {
          next.add(key);
        }
        localStorage.setItem(
          `${getStorageKey(slug)}-user`,
          JSON.stringify([...next]),
        );
        return next;
      });

      setAnimated(key);
      setTimeout(() => setAnimated(null), 400);
    },
    [slug, userReacted],
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      {REACTIONS.map(({ emoji, label, key }) => {
        const active = userReacted.has(key);
        const count = counts[key];
        return (
          <button
            key={key}
            type="button"
            onClick={() => toggle(key)}
            aria-label={`${label}${count > 0 ? ` (${count})` : ""}`}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-all ${
              active
                ? "border-ai-blue/40 bg-ai-blue/10 text-text-primary"
                : "border-[var(--ag-border-subtle)] bg-transparent text-text-muted hover:border-[var(--ag-border-default)] hover:text-text-secondary"
            } ${animated === key ? "scale-110" : ""}`}
          >
            <span
              className={`transition-transform ${animated === key ? "scale-125" : ""}`}
            >
              {emoji}
            </span>
            {count > 0 && (
              <span className="min-w-[1ch] text-xs font-medium tabular-nums">
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
