import { NextResponse } from "next/server";
import { getSkillsRoster } from "@/lib/github";
import { BSTACK_LAYERS } from "@/lib/skills-data";

export const maxDuration = 15;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const layerFilter = searchParams.get("layer");

  let layers;
  let degraded = false;
  try {
    layers = await getSkillsRoster("broomva");
    if (!layers.length) {
      layers = BSTACK_LAYERS;
      degraded = true;
    }
  } catch {
    layers = BSTACK_LAYERS;
    degraded = true;
  }

  if (layerFilter) {
    layers = layers.filter((l) => l.id === layerFilter);
  }

  return NextResponse.json(layers, {
    headers: {
      "Cache-Control": degraded
        ? "no-store"
        : "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
