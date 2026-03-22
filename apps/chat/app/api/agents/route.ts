import { NextResponse } from "next/server";

import { withAuth } from "@/lib/api/with-auth";
import { getUserAgents } from "@/lib/db/agents";

/**
 * GET /api/agents — list the authenticated user's registered agents
 */
export const GET = withAuth(async (_request, { userId }) => {
  try {
    const agents = await getUserAgents(userId);

    return NextResponse.json({
      agents: agents.map((a) => ({
        id: a.id,
        name: a.name,
        publicKey: a.publicKey,
        capabilities: a.capabilities,
        status: a.status,
        lastActiveAt: a.lastActiveAt,
        revokedAt: a.revokedAt,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
      })),
    });
  } catch (err) {
    console.error("[agents] Failed to list agents:", err);
    return NextResponse.json(
      { error: "Failed to list agents" },
      { status: 500 },
    );
  }
});
