"use client";

import { useEffect, useState } from "react";

interface ToolDef {
  name: string;
  signature: string;
  description: string;
}

const TOOLS: readonly ToolDef[] = [
  { name: "fs.read", signature: "fs.read(path)", description: "Read a file" },
  {
    name: "fs.write",
    signature: "fs.write(path, content)",
    description: "Write a file (auto-snapshot)",
  },
  {
    name: "fs.list",
    signature: "fs.list(path)",
    description: "List directory entries",
  },
  {
    name: "fs.search",
    signature: "fs.search(query, glob?)",
    description: "Ripgrep over the workspace",
  },
  {
    name: "fs.apply_patch",
    signature: "fs.apply_patch(patch)",
    description: "Apply a unified diff",
  },
  {
    name: "memory.query",
    signature: "memory.query(scope, depth?)",
    description: "Query the knowledge graph",
  },
  {
    name: "memory.write",
    signature: "memory.write(node)",
    description: "Promote a memory node",
  },
  {
    name: "bash",
    signature: "bash(cmd, args?)",
    description: "Run a shell command (escape hatch)",
  },
];

interface Props {
  open: boolean;
  query: string;
  onSelect: (snippet: string) => void;
  onClose: () => void;
}

/**
 * ToolPicker — opens when the user types `/` in the composer. Hardcoded
 * catalog of 8 typed tools. Selecting inserts `/tool_name(` snippet with
 * the cursor expected to land between the parens (caller handles).
 */
export function ToolPicker({ open, query, onSelect, onClose }: Props) {
  const [activeIndex, setActiveIndex] = useState(0);
  const filtered = !query.trim()
    ? TOOLS
    : TOOLS.filter(
        (t) =>
          t.name.toLowerCase().includes(query.toLowerCase()) ||
          t.description.toLowerCase().includes(query.toLowerCase()),
      );

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
        setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const tool = filtered[activeIndex];
        if (tool) onSelect(`/${tool.name}(`);
        return;
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, filtered, activeIndex, onSelect, onClose]);

  if (!open) return null;

  return (
    <div
      role="listbox"
      aria-label="Tools"
      className="ag-glass-heavy absolute bottom-full left-0 mb-2 w-[420px] overflow-hidden rounded-lg border border-white/12 shadow-lg"
    >
      <div className="border-b border-white/[0.06] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.06em] opacity-55">
        /{query || "tools"}
      </div>
      <ul className="max-h-[40vh] overflow-y-auto">
        {filtered.length === 0 ? (
          <li className="px-3 py-2 text-[12px] opacity-50">No tools match.</li>
        ) : (
          filtered.map((tool, i) => (
            <li key={tool.name}>
              <button
                type="button"
                role="option"
                aria-selected={i === activeIndex}
                onMouseEnter={() => setActiveIndex(i)}
                onFocus={() => setActiveIndex(i)}
                onClick={() => onSelect(`/${tool.name}(`)}
                className={`w-full cursor-pointer px-3 py-2 text-left ${
                  i === activeIndex ? "bg-[color:var(--ag-bg-hover)]" : ""
                }`}
              >
                <div className="font-mono text-[12px] text-[color:var(--ag-ai-blue)]">
                  {tool.signature}
                </div>
                <div className="font-mono text-[10.5px] opacity-65">
                  {tool.description}
                </div>
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
