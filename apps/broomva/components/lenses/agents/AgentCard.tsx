"use client";

import { CapabilityChip } from "./CapabilityChip";
import type { AgentSpec } from "./useAgents";

interface Props {
  spec: AgentSpec;
}

/**
 * AgentCard — one card per installed agent. Renders avatar (deterministic
 * gradient from agent id), name + archetype tag, description, capability
 * chips (one per grant), model badge, and a passive "view spec" hint that
 * routes to the Files lens viewer for the underlying spec.md.
 *
 * v1: clicking the card body opens the spec file in the Files lens via
 * `?file=agents/<id>/spec.md`. Starting a session with the agent (the
 * parent-spec Open button) is deferred to Plan C (welcome-agent wiring).
 */
export function AgentCard({ spec }: Props) {
  const {
    id,
    name,
    archetype,
    description,
    model,
    grants,
    approvalMode,
    path,
  } = spec;

  return (
    <a
      href={`?file=${encodeURIComponent(path)}`}
      className="ag-glass-subtle flex flex-col gap-2.5 rounded-md border border-white/10 p-4 transition-colors hover:border-white/25 hover:bg-[color:var(--ag-bg-hover)]"
    >
      <header className="flex items-center gap-3">
        <Avatar id={id} />
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-mono text-[13px] font-medium">
            {name}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] opacity-60">
            {archetype}
          </span>
        </div>
        {model && (
          <span
            className="ml-auto rounded px-1.5 py-0.5 font-mono text-[9.5px]"
            style={{
              background:
                "color-mix(in oklab, var(--ag-ai-blue) 16%, transparent)",
              color: "var(--ag-ai-blue)",
            }}
          >
            {model}
          </span>
        )}
      </header>
      {description && (
        <p className="font-mono text-[11px] leading-[1.55] opacity-75">
          {description}
        </p>
      )}
      <div className="flex flex-wrap gap-1.5">
        {grants.length === 0 ? (
          <span className="font-mono text-[10px] opacity-50">no grants</span>
        ) : (
          grants.map((g) => (
            <CapabilityChip
              key={g}
              label={g}
              variant={approvalMode === "always" ? "warn" : "ok"}
            />
          ))
        )}
      </div>
      <footer className="flex items-center justify-between font-mono text-[9.5px] opacity-50">
        <span>approval · {approvalMode}</span>
        <span>view spec →</span>
      </footer>
    </a>
  );
}

function Avatar({ id }: { id: string }) {
  // Deterministic gradient seeded by id char codes; no external deps.
  const seed = Array.from(id).reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const hue = seed % 360;
  return (
    <div
      aria-hidden
      className="h-9 w-9 shrink-0 rounded-full"
      style={{
        background: `linear-gradient(135deg, hsl(${hue}deg 70% 55%), hsl(${(hue + 60) % 360}deg 70% 45%))`,
      }}
    />
  );
}
