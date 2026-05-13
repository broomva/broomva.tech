"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSceneContext } from "../SceneContext";

interface Props {
  open: boolean;
  query: string;
  onSelect: (path: string) => void;
  onClose: () => void;
}

/**
 * FilePicker — opens when the user types `@` in the composer. Lists files
 * referenced anywhere in the current scene (tool_call args + intent.path
 * occurrences) plus a small static set of common workspace paths. Filter
 * is substring-match against the typed query. Arrow keys + Enter to
 * select; Esc closes.
 */
export function FilePicker({ open, query, onSelect, onClose }: Props) {
  const { scene } = useSceneContext();
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const items = useMemo(() => {
    const found = new Set<string>();
    const walk = (n: {
      intent?: { args?: { path?: string }; src?: string };
      children?: unknown[];
    }) => {
      const p = (n.intent?.args as { path?: string } | undefined)?.path;
      if (p) found.add(p);
      const src = (n.intent as { src?: string } | undefined)?.src;
      if (src?.startsWith("/") && !src.startsWith("//")) found.add(src);
      for (const c of (n.children ?? []) as Array<{
        intent?: { args?: { path?: string } };
      }>) {
        walk(c as never);
      }
    };
    const root = (
      scene as unknown as {
        root?: { intent?: { args?: { path?: string } }; children?: unknown[] };
      }
    ).root;
    if (root) walk(root as never);
    const fallbacks = [
      "welcome.md",
      "notes/ai-os.md",
      "notes/primitives.md",
      "notes/open-questions.md",
      ".broomva/policy.yml",
    ];
    for (const f of fallbacks) found.add(f);
    const all = Array.from(found);
    if (!query.trim()) return all.slice(0, 8);
    const q = query.toLowerCase();
    return all.filter((p) => p.toLowerCase().includes(q)).slice(0, 8);
  }, [scene, query]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset selection on query change
  useEffect(() => {
    if (!open) return;
    setActiveIndex(0);
  }, [open, query]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, items.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const item = items[activeIndex];
        if (item) onSelect(item);
        return;
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, items, activeIndex, onSelect, onClose]);

  if (!open) return null;

  return (
    <div
      role="listbox"
      aria-label="Files"
      className="ag-glass-heavy absolute bottom-full left-0 mb-2 w-[360px] overflow-hidden rounded-lg border border-white/12 shadow-lg"
    >
      <div className="border-b border-white/[0.06] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.06em] opacity-55">
        @{query || "files"}
      </div>
      <ul ref={listRef} className="max-h-[40vh] overflow-y-auto">
        {items.length === 0 ? (
          <li className="px-3 py-2 text-[12px] opacity-50">No files match.</li>
        ) : (
          items.map((path, i) => (
            <li key={path}>
              <button
                type="button"
                role="option"
                aria-selected={i === activeIndex}
                onMouseEnter={() => setActiveIndex(i)}
                onFocus={() => setActiveIndex(i)}
                onClick={() => onSelect(path)}
                className={`w-full cursor-pointer px-3 py-1.5 text-left font-mono text-[11px] ${
                  i === activeIndex ? "bg-[color:var(--ag-bg-hover)]" : ""
                }`}
              >
                {path}
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
