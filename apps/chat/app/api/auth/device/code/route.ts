import { NextResponse } from "next/server";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  checkDeviceCodeRateLimit,
  getClientIP,
} from "@/lib/utils/rate-limit";

const deviceCodeSchema = z.object({
  client_id: z.string().default("cli"),
  scope: z.string().default(""),
  // --- Agent registration fields (BRO-56) ---
  agent_name: z.string().max(256).optional(),
  host_id: z.string().max(128).optional(),
  public_key: z.string().optional(),
  requested_capabilities: z.array(z.string()).optional(),
});

/**
 * POST /api/auth/device/code
 *
 * RFC 8628 -- Device Authorization Request.
 * Returns a device_code, user_code, and verification URI.
 *
 * Body (optional):
 *   { "client_id": "broomva-cli", "scope": "" }
 *
 * Extended for BRO-56 agent flow:
 *   {
 *     "client_id": "agent:my-agent",
 *     "agent_name": "My Agent",
 *     "host_id": "abc123",
 *     "public_key": "...",
 *     "requested_capabilities": ["chat:send", "chat:read"]
 *   }
 *
 * When agent_name is present, the verification URI includes agent context
 * so the approval page displays the agent's name and requested capabilities.
 */
export async function POST(request: Request) {
  try {
    // Rate limit: 10 requests/minute per IP
    const clientIP = getClientIP(request);
    const rateLimitResult = await checkDeviceCodeRateLimit(clientIP);

    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: "rate_limit_exceeded", error_description: rateLimitResult.error },
        { status: 429, headers: rateLimitResult.headers || {} },
      );
    }

    // Parse body — empty body is fine, schema provides defaults
    let raw: unknown = {};
    try {
      raw = await request.json();
    } catch {
      // empty body is fine, use defaults
    }

    const result = deviceCodeSchema.safeParse(raw);
    if (!result.success) {
      return NextResponse.json(
        { error: "invalid_request", error_description: "Invalid request body" },
        { status: 400 },
      );
    }

    const {
      client_id: clientId,
      scope,
      agent_name: agentName,
      host_id: hostId,
      public_key: publicKey,
      requested_capabilities: requestedCapabilities,
    } = result.data;

    const deviceCode = Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const userCode = generateUserCode();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
    const interval = 5; // seconds

    const id = crypto.randomUUID();
    const now = new Date();

    // If this is an agent flow, encode agent metadata in the scope field
    const isAgentFlow = Boolean(agentName);
    const effectiveScope = isAgentFlow
      ? JSON.stringify({
          agent_name: agentName,
          host_id: hostId,
          public_key: publicKey,
          requested_capabilities: requestedCapabilities ?? [],
        })
      : scope;

    const effectiveClientId = isAgentFlow
      ? `agent:${agentName}`
      : clientId;

    await db.execute(sql`
      INSERT INTO "DeviceAuthCode" ("id", "deviceCode", "userCode", "scope", "clientId", "status", "expiresAt", "pollingInterval", "createdAt")
      VALUES (${id}, ${deviceCode}, ${userCode}, ${effectiveScope}, ${effectiveClientId}, ${"pending"}, ${expiresAt.toISOString()}, ${interval}, ${now.toISOString()})
    `);

    const baseUrl =
      process.env.APP_URL ||
      (process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3001");

    // Build verification URI — include agent context in query params when available
    let verificationUriComplete = `${baseUrl}/device?code=${userCode}`;
    if (isAgentFlow) {
      const params = new URLSearchParams({
        code: userCode,
        agent_name: agentName!,
        ...(requestedCapabilities && requestedCapabilities.length > 0
          ? { capabilities: requestedCapabilities.join(",") }
          : {}),
      });
      verificationUriComplete = `${baseUrl}/device?${params.toString()}`;
    }

    const response: Record<string, unknown> = {
      device_code: deviceCode,
      user_code: userCode,
      verification_uri: `${baseUrl}/device`,
      verification_uri_complete: verificationUriComplete,
      expires_in: 900,
      interval,
    };

    // Include agent_id hint when in agent flow
    if (isAgentFlow && publicKey) {
      const data = new TextEncoder().encode(publicKey);
      const hash = await crypto.subtle.digest("SHA-256", data);
      const hex = Array.from(new Uint8Array(hash))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      response.agent_id = hex.slice(0, 16);
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error("Device code request failed:", error);
    return NextResponse.json(
      {
        error: "internal_error",
        error_description:
          process.env.NODE_ENV === "production"
            ? "Internal server error"
            : String(error),
      },
      { status: 500 },
    );
  }
}

/**
 * Generate a short, human-friendly code like "ABCD-1234".
 * Avoids ambiguous characters (0/O, 1/I/L).
 */
function generateUserCode(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ";
  const digits = "23456789";
  const pick = (set: string, n: number) =>
    Array.from({ length: n }, () => set[Math.floor(Math.random() * set.length)]).join("");
  return `${pick(chars, 4)}-${pick(digits, 4)}`;
}
