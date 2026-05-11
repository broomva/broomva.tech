import { NextResponse } from "next/server";
import { getPromptMetrics } from "@/lib/db/queries";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const result = await getPromptMetrics(slug);
  return NextResponse.json(result);
}
