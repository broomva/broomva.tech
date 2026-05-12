import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { buildPublicGraph } from "@/lib/graph/build-public";

const getCachedPublicGraph = unstable_cache(
  async () => buildPublicGraph(),
  ["public-graph-api"],
  { revalidate: 3600 },
);

export async function GET() {
  const graph = await getCachedPublicGraph();
  return NextResponse.json({
    ...graph,
    generatedAt: new Date().toISOString(),
  });
}
