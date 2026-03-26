import type { Metadata } from "next";

import type { GraphData } from "@/lib/graph";
import { config } from "@/lib/config";

import { GraphView } from "./graph-view";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Knowledge Graph",
  description:
    "Explore the connected knowledge architecture of broomva.tech",
};

const EMPTY_GRAPH: GraphData = { nodes: [], links: [] };

export default async function GraphPage() {
  let initialData: GraphData = EMPTY_GRAPH;

  try {
    const res = await fetch(`${config.appUrl}/api/graph/public`, {
      next: { revalidate: 3600 },
    });
    if (res.ok) {
      initialData = (await res.json()) as GraphData;
    }
  } catch {
    // Fallback to empty graph — component handles this gracefully.
  }

  return (
    <main style={{ position: "fixed", inset: 0, top: 64 }}>
      <GraphView initialData={initialData} userDataUrl="/api/graph/user" />
    </main>
  );
}
