/**
 * GET /api/graph/public — BRO-231
 *
 * ISR-cached endpoint that returns the public knowledge graph built from
 * static content (notes, projects, writing, prompts) and the bstack skills
 * catalog.  No authentication required.
 *
 * Revalidated every hour; the graph is also pre-built at deploy time.
 */

import { NextResponse } from "next/server";
import { buildPublicGraph } from "@/lib/graph/build-public";

export async function GET() {
  try {
    const graph = await buildPublicGraph();
    return NextResponse.json(graph, {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch (err) {
    console.error("[api/graph/public] build failed:", err);
    return NextResponse.json(
      { error: "Failed to build graph" },
      { status: 500 },
    );
  }
}
