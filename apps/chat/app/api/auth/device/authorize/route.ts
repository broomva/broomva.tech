import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db/client";
import { deviceAuthCode, agent } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { signLifeJWT } from "@/lib/ai/vault/jwt";
import { withAuthAndValidation } from "@/lib/api/with-auth";
import { upsertUserFromSession } from "@/lib/db/queries";

const authorizeSchema = z.object({
  user_code: z.string().min(1, "user_code is required"),
  action: z.enum(["approve", "deny"]),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface AgentMetadata {
  agent_name: string;
  agent_key_id?: string;
  public_key?: string;
  host_id?: string;
  requested_capabilities: string[];
}

/**
 * Attempt to parse agent metadata from the scope field.
 * Returns null if the scope is not agent metadata JSON.
 */
function parseAgentMetadata(scope: string): AgentMetadata | null {
  if (!scope.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(scope);
    if (parsed.agent_name) return parsed as AgentMetadata;
    return null;
  } catch {
    return null;
  }
}

/** Derive a deterministic agent key ID from a public key string. */
async function deriveAgentKeyId(publicKey: string): Promise<string> {
  const data = new TextEncoder().encode(publicKey);
  const hash = await crypto.subtle.digest("SHA-256", data);
  const hex = Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex.slice(0, 16);
}

// ---------------------------------------------------------------------------
// POST /api/auth/device/authorize
// ---------------------------------------------------------------------------

/**
 * POST /api/auth/device/authorize
 *
 * Called from the /device page when the logged-in user approves or denies
 * a device code.
 *
 * When the device code was created as part of an agent registration flow
 * (BRO-56), approval also registers the agent in the Agent table with
 * the approving user as the owner.
 */
export const POST = withAuthAndValidation(
  authorizeSchema,
  async (_request, { userId, email, session, body }) => {
    const userCode = body.user_code.toUpperCase().trim();
    const { action } = body;

    // Sync Neon Auth user into app user table before any FK references
    await upsertUserFromSession({ sessionUser: session.user });

    const [record] = await db
      .select()
      .from(deviceAuthCode)
      .where(
        and(
          eq(deviceAuthCode.userCode, userCode),
          eq(deviceAuthCode.status, "pending"),
        ),
      )
      .limit(1);

    if (!record) {
      return NextResponse.json(
        { error: "Code not found or already used." },
        { status: 404 },
      );
    }

    if (new Date() > record.expiresAt) {
      await db
        .update(deviceAuthCode)
        .set({ status: "expired" })
        .where(eq(deviceAuthCode.id, record.id));

      return NextResponse.json(
        { error: "Code has expired. Request a new one." },
        { status: 410 },
      );
    }

    if (action === "deny") {
      await db
        .update(deviceAuthCode)
        .set({ status: "denied", userId })
        .where(eq(deviceAuthCode.id, record.id));

      return NextResponse.json({ status: "denied" });
    }

    // -----------------------------------------------------------------------
    // Approve: sign a JWT for the CLI to use as Bearer token
    // -----------------------------------------------------------------------
    const token = await signLifeJWT({
      id: userId,
      email: email ?? "",
    });

    // -----------------------------------------------------------------------
    // Agent registration on approval (BRO-56)
    // -----------------------------------------------------------------------
    const agentMeta = parseAgentMetadata(record.scope);
    let agentRegistrationResult: Record<string, unknown> | null = null;

    if (agentMeta) {
      try {
        const agentKeyId =
          agentMeta.agent_key_id ??
          (agentMeta.public_key
            ? await deriveAgentKeyId(agentMeta.public_key)
            : null);

        if (agentKeyId) {
          // Check if agent already exists
          const [existing] = await db
            .select()
            .from(agent)
            .where(eq(agent.agentKeyId, agentKeyId))
            .limit(1);

          const now = new Date();

          if (existing) {
            // Re-activate if the same user owns it, reject if different user
            if (existing.userId === userId) {
              await db
                .update(agent)
                .set({
                  name: agentMeta.agent_name,
                  publicKey: agentMeta.public_key,
                  capabilities: agentMeta.requested_capabilities,
                  status: "active",
                  lastActiveAt: now,
                  revokedAt: null,
                })
                .where(eq(agent.id, existing.id));

              agentRegistrationResult = {
                agent_id: agentKeyId,
                status: "active",
                capabilities: agentMeta.requested_capabilities,
              };
            }
            // If different user, we still approve the device code but skip
            // agent registration. The token exchange will reveal the issue.
          } else {
            // Create new agent
            await db.insert(agent).values({
              userId,
              name: agentMeta.agent_name,
              publicKey: agentMeta.public_key,
              agentKeyId,
              capabilities: agentMeta.requested_capabilities,
              status: "active",
              lastActiveAt: now,
              createdAt: now,
              updatedAt: now,
            });

            agentRegistrationResult = {
              agent_id: agentKeyId,
              status: "active",
              capabilities: agentMeta.requested_capabilities,
            };
          }
        }
      } catch (err) {
        // Log but don't fail the device approval
        console.error(
          "[device/authorize] Agent registration failed (non-fatal):",
          err,
        );
      }
    }

    await db
      .update(deviceAuthCode)
      .set({
        status: "approved",
        userId,
        sessionToken: token,
      })
      .where(eq(deviceAuthCode.id, record.id));

    const response: Record<string, unknown> = {
      status: "approved",
      client_id: record.clientId,
    };

    if (agentRegistrationResult) {
      response.agent = agentRegistrationResult;
    }

    return NextResponse.json(response);
  },
);
