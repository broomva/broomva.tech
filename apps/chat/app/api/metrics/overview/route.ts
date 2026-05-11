import { NextResponse } from "next/server";
import { getOverviewMetrics } from "@/lib/db/queries";

const VALID_WINDOWS = ["24h", "7d", "30d", "all"] as const;
type Window = (typeof VALID_WINDOWS)[number];

export async function GET(request: Request) {
  const url = new URL(request.url);
  const since = (url.searchParams.get("since") ?? "7d") as Window;
  if (!VALID_WINDOWS.includes(since)) {
    return NextResponse.json(
      { error: `Invalid since (allowed: ${VALID_WINDOWS.join(", ")})`, code: "invalid_payload" },
      { status: 400 },
    );
  }
  const result = await getOverviewMetrics({ since });
  return NextResponse.json(result);
}
