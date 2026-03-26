import { NextResponse } from "next/server";
import { buildPublicGraph } from "@/lib/graph";

export const revalidate = 3600;

export async function GET() {
  const graph = await buildPublicGraph();
  return NextResponse.json({
    ...graph,
    generatedAt: new Date().toISOString(),
  });
}
