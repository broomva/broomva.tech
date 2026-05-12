import type { Metadata } from "next";
import { searchAgents, CAPABILITY_TAXONOMY } from "@/lib/discovery";
import { AgentDiscoveryGrid } from "@/components/site/agent-discovery-grid";

export const metadata: Metadata = {
  title: "Agent Marketplace — BroomVA",
  description:
    "Discover certified AI agents on the BroomVA platform. Browse by capability, trust level, and status — find the right agent for your workflow.",
};

export default async function AgentsPage() {
  const { agents, total } = await searchAgents({
    status: "certified",
    limit: 100,
  });

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-20 pt-10 sm:px-6 sm:pt-14">
      <header>
        <h1 className="font-display text-4xl text-text-primary sm:text-5xl">
          Agent Marketplace
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-text-secondary">
          {total} certified agent{total !== 1 ? "s" : ""} available. Browse by
          capability and trust level — each agent is evaluated, scored, and
          certified before appearing here.
        </p>
      </header>
      <AgentDiscoveryGrid
        agents={agents}
        capabilities={[...CAPABILITY_TAXONOMY]}
      />
    </main>
  );
}
