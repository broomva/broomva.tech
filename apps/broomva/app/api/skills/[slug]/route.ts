import { NextResponse } from "next/server";
import { getSkillsRoster } from "@/lib/github";
import { BSTACK_LAYERS } from "@/lib/skills-data";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  let layers;
  try {
    layers = await getSkillsRoster("broomva");
    if (!layers.length) layers = BSTACK_LAYERS;
  } catch {
    layers = BSTACK_LAYERS;
  }

  for (const layer of layers) {
    const skill = layer.skills.find((s) => s.slug === slug);
    if (skill) {
      return NextResponse.json({ ...skill, layer: layer.id });
    }
  }

  return NextResponse.json({ error: "Skill not found" }, { status: 404 });
}
