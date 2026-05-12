import { NextResponse } from "next/server";
import { getSkillsRoster } from "@/lib/github";
import { BSTACK_LAYERS } from "@/lib/skills-data";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const layerFilter = searchParams.get("layer");

  let layers;
  try {
    layers = await getSkillsRoster("broomva");
    if (!layers.length) layers = BSTACK_LAYERS;
  } catch {
    layers = BSTACK_LAYERS;
  }

  if (layerFilter) {
    layers = layers.filter((l) => l.id === layerFilter);
  }

  return NextResponse.json(layers);
}
