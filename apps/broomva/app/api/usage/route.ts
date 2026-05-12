import { headers } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { getSafeSession } from "@/lib/auth";
import { getUserUsageSummary } from "@/lib/db/usage";

type Period = "day" | "week" | "month";

function getPeriodRange(period: Period): { start: Date; end: Date } {
  const now = new Date();
  const end = now;
  const start = new Date(now);

  switch (period) {
    case "day":
      start.setHours(0, 0, 0, 0);
      break;
    case "week":
      start.setDate(start.getDate() - 7);
      start.setHours(0, 0, 0, 0);
      break;
    case "month":
      start.setMonth(start.getMonth() - 1);
      start.setHours(0, 0, 0, 0);
      break;
  }

  return { start, end };
}

export async function GET(request: NextRequest) {
  const { data: session } = await getSafeSession({
    fetchOptions: { headers: await headers() },
  });

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  const { searchParams } = request.nextUrl;
  const periodParam = searchParams.get("period") ?? "month";

  if (!["day", "week", "month"].includes(periodParam)) {
    return NextResponse.json(
      { error: "Invalid period. Must be one of: day, week, month" },
      { status: 400 },
    );
  }

  const period = periodParam as Period;
  const { start: periodStart, end: periodEnd } = getPeriodRange(period);

  try {
    const rows = await getUserUsageSummary(userId, periodStart, periodEnd);

    let totalCostCents = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    const byModel: Array<{
      modelId: string | null;
      costCents: number;
      inputTokens: number;
      outputTokens: number;
    }> = [];

    for (const row of rows) {
      totalCostCents += row.totalCostCents;
      totalInputTokens += row.totalInputTokens;
      totalOutputTokens += row.totalOutputTokens;

      byModel.push({
        modelId: row.resource,
        costCents: row.totalCostCents,
        inputTokens: row.totalInputTokens,
        outputTokens: row.totalOutputTokens,
      });
    }

    return NextResponse.json({
      totalCostCents,
      totalInputTokens,
      totalOutputTokens,
      byModel,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
    });
  } catch (error) {
    console.error("Failed to fetch usage summary", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
