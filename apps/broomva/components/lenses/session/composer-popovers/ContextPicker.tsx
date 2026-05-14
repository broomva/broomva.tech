"use client";

import { useState } from "react";
import { FilePicker } from "./FilePicker";

interface Props {
  open: boolean;
  onSelect: (token: string) => void;
  onClose: () => void;
}

type Tab = "files" | "memory" | "agents";

/**
 * ContextPicker — opens on the "+ context" button. Three tabs: Files
 * (delegates to FilePicker), Memory (placeholder), Agents (placeholder).
 * v1 ships only the Files tab functional; the others surface a "coming
 * in v1.1" empty state to teach the user the OS surface area.
 */
export function ContextPicker({ open, onSelect, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("files");

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-label="Add context"
      className="ag-glass-heavy absolute bottom-full left-0 mb-2 w-[440px] overflow-hidden rounded-lg border border-white/12 shadow-lg"
    >
      <div className="flex items-center border-b border-white/[0.06]">
        {(["files", "memory", "agents"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.06em] ${
              t === tab
                ? "bg-[color:var(--ag-bg-hover)] opacity-90"
                : "opacity-55"
            }`}
          >
            {t}
          </button>
        ))}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="px-3 py-1.5 font-mono text-[10.5px] opacity-55 hover:opacity-90"
        >
          ✕
        </button>
      </div>
      <div className="max-h-[40vh] overflow-y-auto">
        {tab === "files" ? (
          // Reuse FilePicker's list logic inline by rendering it with empty query.
          // The FilePicker itself is keyboard-driven; in the tabbed view, clicking
          // a file selects it (handled inside FilePicker via onSelect).
          <FilePicker
            open
            query=""
            onSelect={(path) => onSelect(`@${path} `)}
            onClose={onClose}
          />
        ) : tab === "memory" ? (
          <div className="px-3 py-6 text-center font-mono text-[11px] opacity-50">
            Memory picker — coming in v1.1
          </div>
        ) : (
          <div className="px-3 py-6 text-center font-mono text-[11px] opacity-50">
            Agents picker — coming in v1.1
          </div>
        )}
      </div>
    </div>
  );
}
