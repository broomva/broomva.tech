"use client";

import { useEffect, useRef, useState } from "react";

interface CmdItem {
  id: string;
  label: string;
  hint?: string;
}

const ITEMS: readonly CmdItem[] = [
  { id: "new-session", label: "Start a new session" },
  { id: "switch-agent", label: "Switch agent" },
  { id: "go-files", label: "Open Files lens" },
  { id: "go-agents", label: "Open Agents lens" },
  { id: "go-memory", label: "Open Memory lens", hint: "v1.1" },
  { id: "go-operations", label: "Open Operations lens", hint: "v1.1" },
  { id: "go-policy", label: "Open Policy lens", hint: "v1.1" },
];

/**
 * Universal command palette — opened with ⌘K (or Ctrl+K), closed with Escape.
 * Fuzzy-filters across sessions, files, lenses, and actions.
 *
 * v1 ships static items; PR 4+ will wire dynamic session/file results through
 * lifegw Identity.ListSessions / Events.Subscribe.
 */
export function CmdPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Focus the input when the palette opens.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  if (!open) return null;

  const filtered = query
    ? ITEMS.filter((i) => i.label.toLowerCase().includes(query.toLowerCase()))
    : ITEMS;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[20vh] backdrop-blur-sm"
      onClick={() => setOpen(false)}
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(false);
      }}
    >
      <div
        role="document"
        className="ag-glass-heavy w-[640px] max-w-[90vw] overflow-hidden rounded-xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          type="text"
          placeholder="Go to anything…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full border-b border-[color:var(--ag-border-subtle)] bg-transparent px-5 py-4 text-[14px] outline-none"
        />
        <ul className="max-h-[40vh] overflow-y-auto">
          {filtered.map((it) => (
            <li
              key={it.id}
              className="flex cursor-pointer items-center justify-between px-5 py-3 text-[13px] hover:bg-[color:var(--ag-bg-hover)]"
            >
              <span>{it.label}</span>
              {it.hint && (
                <span className="font-mono text-[10px] opacity-60">
                  {it.hint}
                </span>
              )}
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="px-5 py-3 text-[13px] opacity-50">No matches.</li>
          )}
        </ul>
      </div>
    </div>
  );
}
