import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { agent, deviceAuthCode } from "@/lib/db/schema";
import { resolveAuth } from "@/lib/prompts/resolve-auth";
import { platformCapabilities } from "@/lib/agent-auth";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const registerSchema = z.object({
  /**
   * Ed25519 public key in JWK format (stringified JSON) or hex-encoded DER.
   * The `agentId` is derived from this key if not provided.
   */
  public_key: z.string().min(1, "public_key is required"),
  /**
   * Deterministic agent ID: first 16 hex chars of SHA-256(public_key).
   * If omitted the server derives it from the public_key.
   */
  agent_id: z.string().max(64).optional(),
  /** Friendly human-readable name for this agent. */
  agent_name: z.string().min(1, "agent_name is required").max(256),
  /** Host identifier — e.g. device hostname or JWK thumbprint. */
  host_id: z.string().max(128).optional(),
  /** Requested capability names. Must be a subset of platform capabilities. */
  requested_capabilities: z.array(z.string()).default([]),
});

// Legacy schema (backward compat with the pre-BRO-56 format)
const legacySchema = z.object({
  publicKey: z.string().min(1),
  agentId: z.string().min(1).max(64),
  name: z.string().min(1).max(256),
  capabilities: z.array(z.string()).default([]),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const validCapabilityNames = new Set<string>(
  platformCapabilities.map((c) => c.name),
);

/** Derive a deterministic agent key ID from a public key string. */
async function deriveAgentKeyId(publicKey: string): Promise<string> {
  const data = new TextEncoder().encode(publicKey);
  const hash = await crypto.subtle.digest("SHA-256", data);
  const hex = Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex.slice(0, 16);
}

function generateUserCode(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ";
  const digits = "23456789";
  const pick = (set: string, n: number) =>
    Array.from({ length: n }, () =>
      set[Math.floor(Math.random() * set.length)],
    ).join("");
  return `${pick(chars, 4)}-${pick(digits, 4)}`;
}

// ---------------------------------------------------------------------------
// POST /api/auth/agent/register
// ---------------------------------------------------------------------------

/**
 * POST /api/auth/agent/register
 *
 * Registers a CLI/agent identity with the platform (BRO-56).
 *
 * Two modes:
 *
 * **Authenticated mode** (Bearer JWT or session cookie):
 *   The agent is immediately registered and activated under the calling user.
 *
 * **Unauthenticated mode** (no auth header):
 *   A device authorization flow is initiated. The endpoint returns a
 *   `device_code` and `user_code`; the CLI must poll `/api/auth/device/token`
 *   while the user approves at `/device?code=...&agent_name=...&capabilities=...`.
 *   Once approved, the agent is registered under the approving user.
 *
 * Body (new format):
 *   { public_key, agent_name, host_id?, requested_capabilities?, agent_id? }
 *
 * Body (legacy format — backward compat):
 *   { publicKey, agentId, name, capabilities }
 *
 * Returns:
 *   - Authenticated: { agent_id, registered_at, capabilities, status }
 *   - Unauthenticated: { agent_id, device_code, user_code, verification_uri, ... }
 */
export async function POST(request: Request) {
  try {
    // Parse body
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid or missing JSON body" },
        { status: 400 },
      );
    }

    // Try new schema first, fall back to legacy
    const newResult = registerSchema.safeParse(raw);
    const legacyResult = legacySchema.safeParse(raw);

    let publicKey: string;
    let agentKeyId: string;
    let agentName: string;
    let hostId: string | undefined;
    let requestedCapabilities: string[];

    if (newResult.success) {
      publicKey = newResult.data.public_key;
      agentKeyId =
        newResult.data.agent_id ?? (await deriveAgentKeyId(publicKey));
      agentName = newResult.data.agent_name;
      hostId = newResult.data.host_id;
      requestedCapabilities = newResult.data.requested_capabilities;
    } else if (legacyResult.success) {
      publicKey = legacyResult.data.publicKey;
      agentKeyId = legacyResult.data.agentId;
      agentName = legacyResult.data.name;
      hostId = undefined;
      requestedCapabilities = legacyResult.data.capabilities;
    } else {
      return NextResponse.json(
        { error: "Validation failed", details: newResult.error.issues },
        { status: 400 },
      );
    }

    // Validate requested capabilities against platform capabilities
    const grantedCapabilities = requestedCapabilities.filter((c) =>
      validCapabilityNames.has(c),
    );
    const unknownCapabilities = requestedCapabilities.filter(
      (c) => !validCapabilityNames.has(c),
    );

    // -----------------------------------------------------------------------
    // Try to authenticate the caller
    // -----------------------------------------------------------------------
    const auth = await resolveAuth(request);

    if (auth) {
      // Authenticated mode — register immediately
      return await registerAgentForUser({
        userId: auth.userId,
        publicKey,
        agentKeyId,
        agentName,
        capabilities: grantedCapabilities,
        unknownCapabilities,
      });
    }

    // -----------------------------------------------------------------------
    // Unauthenticated mode — initiate device authorization flow
    // -----------------------------------------------------------------------
    const deviceCode = Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const userCode = generateUserCode();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
    const interval = 5;

    const id = crypto.randomUUID();
    const now = new Date();

    // Store the device code with agent metadata in the scope field (JSON)
    const agentMetadata = JSON.stringify({
      agent_name: agentName,
      agent_key_id: agentKeyId,
      public_key: publicKey,
      host_id: hostId,
      requested_capabilities: grantedCapabilities,
    });

    await db.execute(sql`
      INSERT INTO "DeviceAuthCode" ("id", "deviceCode", "userCode", "scope", "clientId", "status", "expiresAt", "pollingInterval", "createdAt")
      VALUES (${id}, ${deviceCode}, ${userCode}, ${agentMetadata}, ${`agent:${agentName}`}, ${"pending"}, ${expiresAt.toISOString()}, ${interval}, ${now.toISOString()})
    `);

    const baseUrl =
      process.env.APP_URL ||
      (process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3001");

    // Build verification URI with agent context
    const verificationParams = new URLSearchParams({
      code: userCode,
      agent_name: agentName,
      ...(grantedCapabilities.length > 0
        ? { capabilities: grantedCapabilities.join(",") }
        : {}),
    });

    const response: Record<string, unknown> = {
      agent_id: agentKeyId,
      device_code: deviceCode,
      user_code: userCode,
      verification_uri: `${baseUrl}/device`,
      verification_uri_complete: `${baseUrl}/device?${verificationParams.toString()}`,
      expires_in: 900,
      interval,
      status: "pending",
    };

    if (unknownCapabilities.length > 0) {
      response.unknown_capabilities = unknownCapabilities;
    }

    return NextResponse.json(response, { status: 200 });
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

// ---------------------------------------------------------------------------
// Internal: register agent for an authenticated user
// ---------------------------------------------------------------------------

async function registerAgentForUser(opts: {
  userId: string;
  publicKey: string;
  agentKeyId: string;
  agentName: string;
  capabilities: string[];
  unknownCapabilities: string[];
}) {
  const { userId, publicKey, agentKeyId, agentName, capabilities, unknownCapabilities } =
    opts;

  // Look up by agentKeyId (deterministic SHA-256 of public key)
  const [existing] = await db
    .select()
    .from(agent)
    .where(eq(agent.agentKeyId, agentKeyId))
    .limit(1);

  if (existing) {
    // If owned by a different user, reject
    if (existing.userId !== userId) {
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
        name: agentName,
        publicKey,
        capabilities,
        status: "active",
        lastActiveAt: now,
        revokedAt: null,
      })
      .where(eq(agent.id, existing.id));

    const response: Record<string, unknown> = {
      agent_id: agentKeyId,
      registered_at: existing.createdAt.toISOString(),
      capabilities,
      status: "active",
      // Legacy fields for backward compat
      agentId: agentKeyId,
      registeredAt: existing.createdAt.toISOString(),
    };

    if (unknownCapabilities.length > 0) {
      response.unknown_capabilities = unknownCapabilities;
    }

    return NextResponse.json(response);
  }

  // Insert new agent
  const now = new Date();
  await db.insert(agent).values({
    userId,
    name: agentName,
    publicKey,
    agentKeyId,
    capabilities,
    status: "active",
    lastActiveAt: now,
    createdAt: now,
    updatedAt: now,
  });

  const response: Record<string, unknown> = {
    agent_id: agentKeyId,
    registered_at: now.toISOString(),
    capabilities,
    status: "active",
    // Legacy fields for backward compat
    agentId: agentKeyId,
    registeredAt: now.toISOString(),
  };

  if (unknownCapabilities.length > 0) {
    response.unknown_capabilities = unknownCapabilities;
  }

  return NextResponse.json(response, { status: 201 });
}
