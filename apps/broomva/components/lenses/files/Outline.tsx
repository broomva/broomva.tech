"use client";

import { useMemo } from "react";
import { useFile } from "./useFile";

interface Props {
  path: string;
}

interface Heading {
  level: 1 | 2 | 3;
  text: string;
  slug: string;
}

const HEADING_RE = /^(#{1,3})\s+(.+?)\s*$/gm;

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Outline — right-rail panel listing h1/h2/h3 headings from the current
 * file's markdown body. Clicking a heading scrolls the file viewer to the
 * matching anchor (`#${slug}`).
 *
 * Pure derivation from `useFile`: when the file changes (new fs.write
 * envelope), the outline re-renders. Empty state when no headings.
 */
export function Outline({ path }: Props) {
  const file = useFile(path);

  const headings = useMemo<Heading[]>(() => {
    if (!file?.content) return [];
    const out: Heading[] = [];
    const seen = new Map<string, number>();
    HEADING_RE.lastIndex = 0;
    let match: RegExpExecArray | null = HEADING_RE.exec(file.content);
    while (match !== null) {
      const level = match[1].length as 1 | 2 | 3;
      const text = match[2].trim();
      let slug = slugify(text);
      // De-duplicate slugs the way most markdown renderers do (-1, -2…).
      const count = seen.get(slug) ?? 0;
      if (count > 0) slug = `${slug}-${count}`;
      seen.set(slugify(text), count + 1);
      out.push({ level, text, slug });
      match = HEADING_RE.exec(file.content);
    }
    return out;
  }, [file?.content]);

  if (headings.length === 0) {
    return <div className="px-1 py-2 font-mono text-[11px] opacity-60">—</div>;
  }

  return (
    <ul className="flex flex-col gap-0.5 font-mono text-[11px]">
      {headings.map((h) => (
        <li key={h.slug}>
          <a
            href={`#${h.slug}`}
            className="block truncate rounded px-1 py-0.5 opacity-75 transition-colors hover:bg-[color:var(--ag-bg-hover)] hover:opacity-100"
            style={{ paddingLeft: `${(h.level - 1) * 10 + 4}px` }}
          >
            {h.text}
          </a>
        </li>
      ))}
    </ul>
  );
}
