import { NextResponse } from "next/server";
import { getRecentInvocations } from "@/lib/db/queries";

const VALID_SOURCES = ["web", "cli", "skill", "api"] as const;
type Source = (typeof VALID_SOURCES)[number];

export async function GET(request: Request) {
  const url = new URL(request.url);
  const promptSlug = url.searchParams.get("prompt_slug") ?? undefined;
  const sourceParam = url.searchParams.get("source");
  const limitParam = url.searchParams.get("limit");
  const beforeParam = url.searchParams.get("before");

  if (sourceParam && !VALID_SOURCES.includes(sourceParam as Source)) {
    return NextResponse.json(
      {
        error: `Invalid source (allowed: ${VALID_SOURCES.join(", ")})`,
        code: "invalid_payload",
      },
      { status: 400 },
    );
  }

  let before: Date | undefined;
  if (beforeParam) {
    const d = new Date(beforeParam);
    if (Number.isNaN(d.getTime())) {
      return NextResponse.json(
        { error: "Invalid before (must be ISO 8601)", code: "invalid_payload" },
        { status: 400 },
      );
    }
    before = d;
  }

  let limit = 50;
  if (limitParam) {
    const n = Number.parseInt(limitParam, 10);
    if (Number.isFinite(n) && n > 0) limit = Math.min(n, 200);
  }

  const rows = await getRecentInvocations({
    promptSlug,
    source: sourceParam ? (sourceParam as Source) : undefined,
    limit,
    before,
  });
  return NextResponse.json(rows);
}
