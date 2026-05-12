import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { deviceAuthCode, agent } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { JWT_ACCESS_EXPIRY_MS } from "@/lib/ai/vault/jwt";
import {
  checkDeviceTokenRateLimit,
  getClientIP,
} from "@/lib/utils/rate-limit";

/**
 * POST /api/auth/device/token
 *
 * RFC 8628 -- Device Access Token Request.
 * The CLI polls this endpoint until the user approves/denies or the code expires.
 *
 * Body: { "device_code": "...", "grant_type": "urn:ietf:params:oauth:grant-type:device_code" }
 *
 * Responses follow RFC 8628 error codes:
 *   - authorization_pending: user hasn't acted yet
 *   - slow_down: polling too fast (enforced via rate limiting)
 *   - access_denied: user denied
 *   - expired_token: code expired
 *   - 200 + { access_token, token_type, expires_in, refresh_token?, agent? }: approved
 *
 * When the device code was created as part of an agent registration flow
 * (BRO-56), the response includes an `agent` object with the registered
 * agent's ID, status, and granted capabilities.
 */
export async function POST(request: Request) {
  try {
    return await handleTokenRequest(request);
  } catch (error) {
    console.error("Device token request failed:", error);
    return NextResponse.json(
      {
        error: "server_error",
        error_description:
          process.env.NODE_ENV === "production"
            ? "Internal server error"
            : String(error),
      },
      { status: 500 }
    );
  }
}

async function handleTokenRequest(request: Request) {
  let deviceCode: string;

  try {
    const body = await request.json();
    deviceCode = body.device_code;
  } catch {
    return NextResponse.json(
      { error: "invalid_request", error_description: "Missing device_code" },
      { status: 400 }
    );
  }

  if (!deviceCode) {
    return NextResponse.json(
      { error: "invalid_request", error_description: "Missing device_code" },
      { status: 400 }
    );
  }

  // Rate limit: 5 requests/minute per device_code + IP (RFC 8628 slow_down)
  const clientIP = getClientIP(request);
  const rateLimitResult = await checkDeviceTokenRateLimit(clientIP, deviceCode);

  if (!rateLimitResult.success) {
    return NextResponse.json(
      {
        error: rateLimitResult.errorCode,
        error_description: rateLimitResult.error,
      },
      { status: 400, headers: rateLimitResult.headers || {} },
    );
  }

  const [record] = await db
    .select()
    .from(deviceAuthCode)
    .where(eq(deviceAuthCode.deviceCode, deviceCode))
    .limit(1);

  if (!record) {
    return NextResponse.json(
      { error: "invalid_grant", error_description: "Unknown device code" },
      { status: 400 }
    );
  }

  // Check expiration
  if (new Date() > record.expiresAt) {
    // Clean up expired record
    await db
      .update(deviceAuthCode)
      .set({ status: "expired" })
      .where(eq(deviceAuthCode.id, record.id));

    return NextResponse.json(
      { error: "expired_token", error_description: "Device code has expired" },
      { status: 400 }
    );
  }

  switch (record.status) {
    case "pending":
      return NextResponse.json(
        {
          error: "authorization_pending",
          error_description: "User has not yet authorized",
        },
        { status: 400 }
      );

    case "denied":
      // Clean up denied record
      await db.delete(deviceAuthCode).where(eq(deviceAuthCode.id, record.id));

      return NextResponse.json(
        { error: "access_denied", error_description: "User denied authorization" },
        { status: 400 }
      );

    case "approved": {
      // Clean up used record
      await db.delete(deviceAuthCode).where(eq(deviceAuthCode.id, record.id));

      // sessionToken may be a JSON object with {accessToken, refreshToken}
      // (BRO-121) or a plain JWT string (legacy flow)
      let accessToken: string;
      let refreshTokenValue: string | undefined;

      try {
        const parsed = JSON.parse(record.sessionToken ?? "");
        accessToken = parsed.accessToken;
        refreshTokenValue = parsed.refreshToken;
      } catch {
        // Legacy: sessionToken is just the JWT string
        accessToken = record.sessionToken ?? "";
      }

      const response: Record<string, unknown> = {
        access_token: accessToken,
        token_type: "Bearer",
        expires_in: Math.floor(JWT_ACCESS_EXPIRY_MS / 1000),
      };

      if (refreshTokenValue) {
        response.refresh_token = refreshTokenValue;
      }

      // ---------------------------------------------------------------
      // Agent info enrichment (BRO-56)
      // ---------------------------------------------------------------
      // If this device code was created for an agent registration,
      // include the registered agent's details in the token response.
      const agentMeta = parseAgentMetadata(record.scope);
      if (agentMeta && record.userId) {
        try {
          const agentKeyId =
            agentMeta.agent_key_id ??
            (agentMeta.public_key
              ? await deriveAgentKeyId(agentMeta.public_key)
              : null);

          if (agentKeyId) {
            const [agentRecord] = await db
              .select()
              .from(agent)
              .where(eq(agent.agentKeyId, agentKeyId))
              .limit(1);

            if (agentRecord) {
              response.agent = {
                agent_id: agentRecord.agentKeyId,
                name: agentRecord.name,
                status: agentRecord.status,
                capabilities: agentRecord.capabilities ?? [],
                registered_at: agentRecord.createdAt.toISOString(),
              };
            }
          }
        } catch (err) {
          // Non-fatal: log and continue with the token response
          console.error(
            "[device/token] Agent info enrichment failed (non-fatal):",
            err,
          );
        }
      }

      return NextResponse.json(response);
    }

    default:
      return NextResponse.json(
        { error: "server_error", error_description: "Unexpected state" },
        { status: 500 }
      );
  }
}

// ---------------------------------------------------------------------------
// Agent metadata helpers (shared with device/authorize)
// ---------------------------------------------------------------------------

interface AgentMetadata {
  agent_name: string;
  agent_key_id?: string;
  public_key?: string;
  host_id?: string;
  requested_capabilities: string[];
}

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

async function deriveAgentKeyId(publicKey: string): Promise<string> {
  const data = new TextEncoder().encode(publicKey);
  const hash = await crypto.subtle.digest("SHA-256", data);
  const hex = Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex.slice(0, 16);
}
