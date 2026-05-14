"use client";

import { useRecentOps } from "./useRecentOps";

const KIND_COLOR: Record<string, string> = {
  fs: "var(--ag-ai-blue)",
  memory: "var(--ag-accent-blue)",
  run: "var(--ag-success)",
  policy: "var(--ag-warning)",
  payment: "var(--ag-warning)",
};

/**
 * RecentOpsFeed — live-updating list of recent fs/memory/run/policy/
 * payment events derived from the scene. Color-coded pip per kind, newest
 * at top.
 *
 * The list is a pure derivation of scene state via useRecentOps; new
 * envelopes from the SSE stream cause the scene reducer to apply, which
 * re-derives the ops list. No subscription duplication.
 */
export function RecentOpsFeed() {
  const ops = useRecentOps();

  if (ops.length === 0) {
    return <div className="px-1 py-2 font-mono text-[11px] opacity-60">—</div>;
  }

  return (
    <ul className="flex flex-col gap-1 font-mono text-[10.5px]">
      {ops.map((op) => (
        <li
          key={op.id}
          className="flex items-center gap-1.5 rounded border border-white/[0.06] bg-black/15 px-2 py-1"
        >
          <span
            className="h-1 w-1 shrink-0 rounded-full"
            style={{
              background: KIND_COLOR[op.kind] ?? "var(--ag-text-muted)",
            }}
            aria-hidden
          />
          <span className="truncate">
            <span className="opacity-90">{op.label}</span>
            {op.arg && <span className="ml-1 opacity-55">{op.arg}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}
