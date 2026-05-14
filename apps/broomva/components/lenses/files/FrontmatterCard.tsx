"use client";

import type { FileRecord } from "./useFile";

interface Props {
  frontmatter: FileRecord["frontmatter"];
  path: string;
}

/**
 * FrontmatterCard — chip row above the file body. Renders kind, tags,
 * created, updated when present. Falls back to a minimal "untitled" card
 * when frontmatter is empty.
 */
export function FrontmatterCard({ frontmatter, path }: Props) {
  const { kind, tags, created, updated } = frontmatter;
  const hasAnything = kind || (tags && tags.length > 0) || created || updated;

  return (
    <div className="ag-glass-subtle mb-4 flex flex-wrap items-center gap-2 rounded-md border border-white/10 px-3 py-2 font-mono text-[10.5px]">
      <span className="opacity-60">{path}</span>
      {kind && (
        <span
          className="rounded px-1.5 py-0.5"
          style={{
            background:
              "color-mix(in oklab, var(--ag-ai-blue) 18%, transparent)",
            color: "var(--ag-ai-blue)",
          }}
        >
          {kind}
        </span>
      )}
      {tags?.map((t) => (
        <span
          key={t}
          className="rounded border border-white/15 px-1.5 py-0.5 opacity-80"
        >
          #{t}
        </span>
      ))}
      {created && (
        <span className="ml-auto opacity-50">
          created · {formatDate(created)}
        </span>
      )}
      {updated && (
        <span className="opacity-50">updated · {formatDate(updated)}</span>
      )}
      {!hasAnything && <span className="ml-auto opacity-50">untitled</span>}
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}
