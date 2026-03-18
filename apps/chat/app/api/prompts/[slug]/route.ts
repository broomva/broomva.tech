import { NextResponse } from "next/server";
import { getContentBySlug } from "@/lib/content";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const entry = await getContentBySlug("prompts", slug);

  if (!entry) {
    return NextResponse.json({ error: "Prompt not found" }, { status: 404 });
  }

  return NextResponse.json(entry);
}
