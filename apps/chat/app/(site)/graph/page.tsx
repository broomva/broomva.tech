/**
 * /graph — BRO-234
 *
 * Knowledge graph page. Public layer is pre-built at deploy time (ISR).
 * Authenticated layer is fetched client-side by <KnowledgeGraph> itself.
 */

import type { Metadata } from "next";
import { headers } from "next/headers";
import { KnowledgeGraph } from "@/components/graph/knowledge-graph";
import { getSafeSession } from "@/lib/auth";
import { buildPublicGraph } from "@/lib/graph/build-public";

export const metadata: Metadata = {
  title: "Knowledge Graph",
  description:
    "Explore the connected knowledge architecture of broomva.tech — documentation, projects, prompts, skills, and (when signed in) your personal agent memory.",
  openGraph: {
    title: "Knowledge Graph | broomva.tech",
    description:
      "Force-directed graph of all notes, projects, skills, and prompts — plus your personal Lago memory vault when signed in.",
    url: "https://broomva.tech/graph",
  },
};

export default async function GraphPage() {
  const [initialData, { data: session }] = await Promise.all([
    buildPublicGraph(),
    getSafeSession({ fetchOptions: { headers: await headers() } }),
  ]);

  return (
    <div
      className="fixed inset-0 top-16 flex flex-col"
      style={{ height: "calc(100dvh - 4rem)" }}
    >
      <div className="flex items-center justify-between border-b border-[var(--ag-border-default)] px-5 py-3">
        <div>
          <h1 className="font-display text-lg font-semibold text-text-primary">
            Knowledge Graph
          </h1>
          <p className="text-xs text-text-muted">
            {initialData.nodes.length} public nodes
            {session
              ? " · personal layer active"
              : " · sign in to add your memory"}
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <KnowledgeGraph
          initialData={initialData}
          userDataUrl={session ? "/api/graph/user" : undefined}
        />
      </div>
    </div>
  );
}
