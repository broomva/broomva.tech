import { NextResponse } from "next/server";
import { getSkillsRoster } from "@/lib/github";
import { BSTACK_LAYERS } from "@/lib/skills-data";

export const maxDuration = 15;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

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

  for (const layer of layers) {
    const skill = layer.skills.find((s) => s.slug === slug);
    if (skill) {
      return NextResponse.json(
        { ...skill, layer: layer.id },
        {
          headers: {
            "Cache-Control": degraded
              ? "no-store"
              : "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
          },
        },
      );
    }
  }

  return NextResponse.json(
    { error: "Skill not found" },
    { status: 404, headers: degraded ? { "Cache-Control": "no-store" } : undefined },
  );
}
