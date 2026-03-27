/**
 * /graph — BRO-234
 *
 * Knowledge graph page. Public layer is pre-built at deploy time (ISR).
 * Authenticated layer is fetched client-side by <KnowledgeGraph> itself.
 *
 * Layout: fixed overlay covering the viewport below the site header (top-16).
 * The graph sits at z-10 — above the site footer (z-0) but below TopNav (z-40).
 * Bottom is inset by 4.5rem to clear the TopNav dock.
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
    /* Fixed overlay: starts below the site header, stops above the bottom dock */
    <div
      className="fixed left-0 right-0 top-16 z-10 flex flex-col overflow-hidden"
      style={{ bottom: "4.5rem" }}
    >
      {/* Page title bar */}
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--ag-border-default)] px-5 py-3">
        <div>
          <h1 className="font-display text-base font-semibold text-text-primary">
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

      {/* Graph canvas — fills remaining height */}
      <div className="min-h-0 flex-1 overflow-hidden">
        <KnowledgeGraph
          initialData={initialData}
          userDataUrl={session ? "/api/graph/user" : undefined}
        />
      </div>
    </div>
  );
}
