"use client";

import { AgentCard } from "./AgentCard";
import { useAgents } from "./useAgents";

/**
 * AgentsLens — center-stage gallery. v1 ships read-only: each card opens
 * the underlying spec.md in the Files lens viewer (via ?file=). Per the
 * parent spec, Plan C will wire an "Open session" action that calls
 * Agent.CreateSession via the lifegw client.
 */
export function AgentsLens() {
  const agents = useAgents();

  if (agents.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-6 font-mono text-[12px] opacity-60">
        No agents installed yet. The Welcome agent will populate this lens.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto px-6 py-5">
      <header className="mb-4 flex items-baseline gap-3">
        <h1 className="font-mono text-[15px]">Agents</h1>
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] opacity-55">
          {agents.length} installed
        </span>
      </header>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
        {agents.map((a) => (
          <AgentCard key={a.id} spec={a} />
        ))}
      </div>
    </div>
  );
}
