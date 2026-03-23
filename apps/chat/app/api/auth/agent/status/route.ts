import { eq, and } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { agent } from "@/lib/db/schema";
import { resolveAuth } from "@/lib/prompts/resolve-auth";
import { platformCapabilities } from "@/lib/agent-auth";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Default agent session lifetime (24 hours from creation). */
const AGENT_MAX_LIFETIME_MS = 24 * 60 * 60 * 1000;

function computeExpiration(createdAt: Date): string {
  return new Date(createdAt.getTime() + AGENT_MAX_LIFETIME_MS).toISOString();
}

// ---------------------------------------------------------------------------
// GET /api/auth/agent/status?agent_id=<id>
// ---------------------------------------------------------------------------

/**
 * GET /api/auth/agent/status
 *
 * Check the registration status of an agent (BRO-56).
 *
 * Query params:
 *   - agent_id (required) — the deterministic agent key ID
 *
 * Requires authentication (Bearer JWT or session cookie). The caller must be
 * the user who owns the agent, or the request is rejected with 403.
 *
 * Returns:
 *   {
 *     agent_id, name, status, capabilities, granted_capabilities,
 *     host_id, created_at, last_active_at, expires_at
 *   }
 */
export async function GET(request: Request) {
  try {
    // Authenticate
    const auth = await resolveAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Parse agent_id from query string
    const { searchParams } = new URL(request.url);
    const agentKeyId = searchParams.get("agent_id");

    if (!agentKeyId) {
      return NextResponse.json(
        { error: "Missing required query parameter: agent_id" },
        { status: 400 },
      );
    }

    // Look up agent
    const [record] = await db
      .select()
      .from(agent)
      .where(
        and(
          eq(agent.agentKeyId, agentKeyId),
          eq(agent.userId, auth.userId),
        ),
      )
      .limit(1);

    if (!record) {
      return NextResponse.json(
        { error: "Agent not found" },
        { status: 404 },
      );
    }

    // Build capability grants with descriptions from the platform
    const capabilityMap = new Map<string, string>(
      platformCapabilities.map((c) => [c.name, c.description]),
    );

    const grantedCapabilities = (record.capabilities ?? []).map((name) => ({
      capability: name,
      status: record.status === "active" ? "active" : "revoked",
      description: capabilityMap.get(name) ?? null,
    }));

    // Check if agent is expired based on creation time + max lifetime
    let effectiveStatus = record.status;
    const expiresAt = computeExpiration(record.createdAt);
    if (
      record.status === "active" &&
      new Date() > new Date(expiresAt)
    ) {
      effectiveStatus = "expired";
      // Lazily mark as expired in the DB
      await db
        .update(agent)
        .set({ status: "expired" })
        .where(eq(agent.id, record.id));
    }

    return NextResponse.json({
      agent_id: record.agentKeyId,
      name: record.name,
      status: effectiveStatus,
      capabilities: record.capabilities ?? [],
      granted_capabilities: grantedCapabilities,
      public_key: record.publicKey,
      created_at: record.createdAt.toISOString(),
      last_active_at: record.lastActiveAt?.toISOString() ?? null,
      revoked_at: record.revokedAt?.toISOString() ?? null,
      expires_at: expiresAt,
    });
  } catch (error) {
    console.error("[agent/status] Error:", error);
    return NextResponse.json(
      {
        error:
          process.env.NODE_ENV === "production"
            ? "Internal server error"
            : String(error),
      },
      { status: 500 },
    );
  }
}
