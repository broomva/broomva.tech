import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { agent } from "@/lib/db/schema";
import { resolveAuth } from "@/lib/prompts/resolve-auth";

const registerSchema = z.object({
  publicKey: z.string().min(1, "publicKey is required"),
  agentId: z.string().min(1, "agentId is required").max(64),
  name: z.string().min(1, "name is required").max(256),
  capabilities: z.array(z.string()).default([]),
});

/**
 * POST /api/auth/agent/register
 *
 * Registers a CLI/agent identity with the platform (BRO-56).
 *
 * The caller must be authenticated (Bearer JWT from device flow or session cookie).
 * The request body contains the agent's public key, deterministic agent ID
 * (SHA-256 of public key, first 16 hex chars), friendly name, and requested
 * capabilities.
 *
 * If an agent with the same agentKeyId already exists for this user, the record
 * is updated (re-activated if it was revoked). If the agentKeyId belongs to a
 * different user, registration is rejected.
 *
 * Body: { publicKey, agentId, name, capabilities }
 * Returns: { agentId, registeredAt, capabilities, status }
 */
export async function POST(request: Request) {
  try {
    // Authenticate via Bearer JWT or session cookie
    const auth = await resolveAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Parse and validate body
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid or missing JSON body" },
        { status: 400 },
      );
    }

    const result = registerSchema.safeParse(raw);
    if (!result.success) {
      return NextResponse.json(
        { error: "Validation failed", details: result.error.issues },
        { status: 400 },
      );
    }

    const { publicKey, agentId, name, capabilities } = result.data;

    // Look up by agentKeyId (deterministic SHA-256 of public key)
    const [existing] = await db
      .select()
      .from(agent)
      .where(eq(agent.agentKeyId, agentId))
      .limit(1);

    if (existing) {
      // If owned by a different user, reject
      if (existing.userId !== auth.userId) {
        return NextResponse.json(
          { error: "Agent ID is already registered to another user" },
          { status: 409 },
        );
      }

      // Update existing agent (re-activate if revoked, update name/capabilities)
      const now = new Date();
      await db
        .update(agent)
        .set({
          name,
          publicKey,
          capabilities,
          status: "active",
          lastActiveAt: now,
          revokedAt: null,
        })
        .where(eq(agent.id, existing.id));

      return NextResponse.json({
        agentId,
        registeredAt: existing.createdAt.toISOString(),
        capabilities,
        status: "active",
      });
    }

    // Insert new agent
    const now = new Date();
    await db.insert(agent).values({
      userId: auth.userId,
      name,
      publicKey,
      agentKeyId: agentId,
      capabilities,
      status: "active",
      lastActiveAt: now,
      createdAt: now,
      updatedAt: now,
    });

    return NextResponse.json({
      agentId,
      registeredAt: now.toISOString(),
      capabilities,
      status: "active",
    });
  } catch (error) {
    console.error("[agent/register] Error:", error);
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
