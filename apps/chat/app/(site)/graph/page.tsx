import type { Metadata } from "next";
import { unstable_cache } from "next/cache";

import type { GraphData } from "@/lib/graph";
import { buildPublicGraph } from "@/lib/graph";

import { GraphView } from "./graph-view";

export const metadata: Metadata = {
  title: "Knowledge Graph",
  description:
    "Explore the connected knowledge architecture of broomva.tech",
};

const EMPTY_GRAPH: GraphData = { nodes: [], links: [] };

const getCachedPublicGraph = unstable_cache(
  async () => buildPublicGraph(),
  ["public-graph"],
  { revalidate: 3600 },
);

export default async function GraphPage() {
  let initialData: GraphData = EMPTY_GRAPH;

  try {
    initialData = await getCachedPublicGraph();
  } catch {
    // Fallback to empty graph — component handles this gracefully.
  }

  return (
    <main style={{ position: "fixed", inset: 0, top: 64 }}>
      <GraphView initialData={initialData} userDataUrl="/api/graph/user" />
    </main>
  );
}
