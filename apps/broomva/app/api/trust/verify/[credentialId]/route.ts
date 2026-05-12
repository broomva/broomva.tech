import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { agentRegistration } from "@/lib/db/schema";

/**
 * GET /api/trust/verify/[credentialId] — Verify an agent credential (PUBLIC).
 *
 * Returns trust status for a given credentialId.
 * No authentication required — designed for third-party verification.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ credentialId: string }> },
) {
  const { credentialId } = await params;

  if (!credentialId) {
    return NextResponse.json(
      { valid: false, error: "Missing credentialId" },
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
        status: agentRegistration.status,
        lastEvaluatedAt: agentRegistration.lastEvaluatedAt,
        credentialId: agentRegistration.credentialId,
        createdAt: agentRegistration.createdAt,
      })
      .from(agentRegistration)
      .where(eq(agentRegistration.credentialId, credentialId))
      .limit(1);

    if (!agent || agent.status === "revoked") {
      return NextResponse.json({ valid: false });
    }

    return NextResponse.json({
      valid: agent.status === "certified",
      agent: {
        name: agent.name,
        trustScore: agent.trustScore,
        trustLevel: agent.trustLevel,
        lastEvaluatedAt: agent.lastEvaluatedAt,
      },
      credential: {
        id: agent.credentialId,
        issuedAt: agent.createdAt,
        // Credentials valid for 1 year from last evaluation (or creation if never evaluated)
        expiresAt: agent.lastEvaluatedAt
          ? new Date(
              agent.lastEvaluatedAt.getTime() + 365 * 24 * 60 * 60 * 1000,
            )
          : null,
      },
    });
  } catch (err) {
    console.error("[trust/verify] Failed to verify credential:", err);
    return NextResponse.json(
      { valid: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
