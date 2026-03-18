import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getContentList, getContentBySlug } from "@/lib/content";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const category = searchParams.get("category");
  const tag = searchParams.get("tag");
  const model = searchParams.get("model");
  const format = searchParams.get("format");

  let entries = await getContentList("prompts");

  if (category) {
    entries = entries.filter((e) => e.category === category);
  }
  if (tag) {
    entries = entries.filter((e) => e.tags.includes(tag));
  }
  if (model) {
    entries = entries.filter((e) => e.model === model);
  }

  if (format === "full") {
    const full = await Promise.all(
      entries.map((e) => getContentBySlug("prompts", e.slug)),
    );
    return NextResponse.json(full.filter(Boolean));
  }

  return NextResponse.json(entries);
}
