"use client";

import type { LifeJournalEntry } from "../_lib/types";

interface Props {
  events: LifeJournalEntry[];
}

function prettyLabel(e: LifeJournalEntry): string {
  if (e.kind === "llm" && e.label === "USER") return "You asked";
  if (e.kind === "tool" && e.label === "TOOL") return `Arcan ran ${e.actor}`;
  if (e.kind === "fs") return `Filesystem · ${e.label.toLowerCase()}`;
  if (e.kind === "nous") return "Nous judged the turn";
  if (e.kind === "autonomic")
    return `Autonomic · ${e.label.toLowerCase()} regulation`;
  return e.label;
}

export function Timeline({ events }: Props) {
  // Hide raw RESULT rows for a cleaner narrative view.
  const items = events.filter((e) => e.label !== "RESULT");
  return (
    <div className="timeline">
      {items.length === 0 && (
        <div style={{ color: "var(--ag-text-muted)", fontSize: 12 }}>
          Nothing yet.
        </div>
      )}
      {items.map((e) => (
        <div
          key={e.id}
          className={`tl-item ${e.kind === "llm" ? "is-agent" : ""}`}
        >
          <div className="tl-item__head">
            <span style={{ fontFamily: "var(--ag-font-heading)" }}>
              {prettyLabel(e)}
            </span>
            <span className="tl-item__ts">{e.ts}</span>
          </div>
          <div className="tl-item__body">{e.msg}</div>
        </div>
      ))}
    </div>
  );
}
