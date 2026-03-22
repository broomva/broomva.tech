import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { withAuth } from "@/lib/api/with-auth";
import { getAgentByIdForUser, revokeAgent } from "@/lib/db/agents";
import { logAudit } from "@/lib/db/audit";
import { getAgentUsageSummary } from "@/lib/db/usage";

/**
 * GET /api/agents/:id — get single agent details with usage summary
 */
export const GET = withAuth(async (request: NextRequest, { userId }) => {
  const id = request.url.split("/api/agents/")[1]?.split("/")[0]?.split("?")[0];
  if (!id) {
    return NextResponse.json({ error: "Missing agent ID" }, { status: 400 });
  }

  try {
    const agentRecord = await getAgentByIdForUser(id, userId);
    if (!agentRecord) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    const usage = await getAgentUsageSummary(id);

    return NextResponse.json({
      agent: {
        id: agentRecord.id,
        name: agentRecord.name,
        publicKey: agentRecord.publicKey,
        capabilities: agentRecord.capabilities,
        status: agentRecord.status,
        lastActiveAt: agentRecord.lastActiveAt,
        revokedAt: agentRecord.revokedAt,
        createdAt: agentRecord.createdAt,
        updatedAt: agentRecord.updatedAt,
      },
      usage: {
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
      },
    });
  } catch (err) {
    console.error("[agents] Failed to get agent:", err);
    return NextResponse.json({ error: "Failed to get agent" }, { status: 500 });
  }
});

/**
 * DELETE /api/agents/:id — revoke an agent
 */
export const DELETE = withAuth(async (request: NextRequest, { userId }) => {
  const id = request.url.split("/api/agents/")[1]?.split("/")[0]?.split("?")[0];
  if (!id) {
    return NextResponse.json({ error: "Missing agent ID" }, { status: 400 });
  }

  try {
    const revoked = await revokeAgent(id, userId);
    if (!revoked) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    logAudit({
      actorId: userId,
      action: "agent.revoked",
      resourceType: "agent",
      resourceId: id,
      agentId: id,
    });

    return NextResponse.json({
      agent: {
        id: revoked.id,
        name: revoked.name,
        status: revoked.status,
        revokedAt: revoked.revokedAt,
      },
    });
  } catch (err) {
    console.error("[agents] Failed to revoke agent:", err);
    return NextResponse.json(
      { error: "Failed to revoke agent" },
      { status: 500 },
    );
  }
});
