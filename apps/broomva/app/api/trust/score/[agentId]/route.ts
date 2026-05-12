import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { agentRegistration } from "@/lib/db/schema";

/**
 * GET /api/trust/score/[agentId] — Get agent trust score (PUBLIC).
 *
 * Returns the trust profile for a registered agent.
 * No authentication required — designed for public consumption.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const { agentId } = await params;

  if (!agentId) {
    return NextResponse.json(
      { error: "Missing agentId" },
      { status: 400 },
    );
  }

  try {
    const [agent] = await db
      .select({
        id: agentRegistration.id,
        name: agentRegistration.name,
        trustScore: agentRegistration.trustScore,
        trustLevel: agentRegistration.trustLevel,
        capabilities: agentRegistration.capabilities,
        status: agentRegistration.status,
        lastEvaluatedAt: agentRegistration.lastEvaluatedAt,
      })
      .from(agentRegistration)
      .where(eq(agentRegistration.id, agentId))
      .limit(1);

    if (!agent) {
      return NextResponse.json(
        { error: "Agent not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      id: agent.id,
      name: agent.name,
      trustScore: agent.trustScore,
      trustLevel: agent.trustLevel,
      capabilities: agent.capabilities,
      status: agent.status,
      lastEvaluatedAt: agent.lastEvaluatedAt,
    });
  } catch (err) {
    console.error("[trust/score] Failed to fetch agent score:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
