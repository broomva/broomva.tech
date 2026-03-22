import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { withAuth } from "@/lib/api/with-auth";
import { getAgentByIdForUser } from "@/lib/db/agents";
import { getAgentUsageSummary } from "@/lib/db/usage";

/**
 * GET /api/agents/:id/usage — usage breakdown for a specific agent
 */
export const GET = withAuth(async (request: NextRequest, { userId }) => {
  // Extract agent ID from URL path
  const segments = request.url.split("/api/agents/")[1]?.split("/");
  const id = segments?.[0];
  if (!id) {
    return NextResponse.json({ error: "Missing agent ID" }, { status: 400 });
  }

  try {
    // Verify the agent belongs to this user
    const agentRecord = await getAgentByIdForUser(id, userId);
    if (!agentRecord) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    const usage = await getAgentUsageSummary(id);

    return NextResponse.json({
      totalTokens: usage.totalInputTokens + usage.totalOutputTokens,
      totalCost: usage.totalCostCents,
      eventCount: usage.eventCount,
      byModel: usage.byModel.map((m) => ({
        model: m.resource ?? "unknown",
        inputTokens: m.totalInputTokens,
        outputTokens: m.totalOutputTokens,
        costCents: m.totalCostCents,
        eventCount: m.eventCount,
      })),
    });
  } catch (err) {
    console.error("[agents] Failed to get agent usage:", err);
    return NextResponse.json(
      { error: "Failed to get agent usage" },
      { status: 500 },
    );
  }
});
