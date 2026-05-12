/**
 * Agent Auth Protocol integration (BRO-54)
 *
 * Creates a standalone Better Auth instance with the @better-auth/agent-auth
 * plugin to handle agent identity, registration, and capability-based
 * authorization per the Agent Auth Protocol spec.
 *
 * This is separate from the main Neon Auth instance (lib/auth.ts) because
 * Neon Auth is a server-side proxy that does not support Better Auth plugins.
 * The agent-auth instance shares the same Postgres database and user table.
 *
 * @see https://agent-auth-protocol.com/
 * @see https://www.npmjs.com/package/@better-auth/agent-auth
 */

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { agentAuth, verifyAgentRequest as _verifyAgentRequest } from "@better-auth/agent-auth";
import { db } from "@/lib/db/client";

// ---------------------------------------------------------------------------
// Platform capabilities — what agents can request access to
// ---------------------------------------------------------------------------

const PLATFORM_CAPABILITIES = [
  {
    name: "chat:send",
    description: "Send messages in chat conversations",
  },
  {
    name: "chat:read",
    description: "Read chat conversations and message history",
  },
  {
    name: "organization:read",
    description: "Read organization metadata and membership",
  },
  {
    name: "organization:write",
    description: "Create and manage organizations",
  },
  {
    name: "usage:read",
    description: "Read usage events and billing data",
  },
  {
    name: "deployment:read",
    description: "Read Life deployment status and configuration",
  },
  {
    name: "deployment:write",
    description: "Create, update, and manage Life deployments",
  },
  {
    name: "memory:read",
    description: "Read from the user's Lago memory vault",
  },
  {
    name: "memory:write",
    description: "Write to the user's Lago memory vault",
  },
  {
    name: "trust:read",
    description: "Read trust scores from the Autonomic controller",
  },
] as const;

// ---------------------------------------------------------------------------
// Better Auth instance with Agent Auth plugin
// ---------------------------------------------------------------------------

export const agentAuthInstance = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  secret: process.env.AUTH_SECRET,
  baseURL: process.env.APP_URL || "https://broomva.tech",
  basePath: "/api/auth/agent-protocol",

  plugins: [
    // @ts-ignore — version mismatch between better-auth and @better-auth/agent-auth AuthContext types
    agentAuth({
      providerName: "Broomva Platform",
      providerDescription:
        "Open AI platform for agents and humans — Agent OS, managed deployments, trust & credit infrastructure",
      modes: ["delegated", "autonomous"],
      allowedKeyAlgorithms: ["Ed25519"],
      approvalMethods: ["device_authorization"],
      deviceAuthorizationPage: "/device/capabilities",
      capabilities: [...PLATFORM_CAPABILITIES],
      maxAgentsPerUser: 25,
      agentSessionTTL: 3600, // 1 hour sliding window
      agentMaxLifetime: 86400, // 24 hours
      jwtMaxAge: 60, // 60 second JWT validity
      requireAuthForCapabilities: false,
    }),
  ],
});

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/**
 * Verify an agent JWT from an incoming request.
 *
 * Delegates to the plugin's `/agent/session` endpoint which runs the full
 * verification flow (signature check, expiry, revocation, capability grants).
 *
 * Returns the agent session payload if valid, or null if the request
 * does not contain a valid agent JWT.
 */
export async function verifyAgentRequest(
  request: Request,
): Promise<{
  agentId: string;
  userId: string | null;
  hostId: string;
  capabilities: string[];
} | null> {
  try {
    // @ts-ignore — same version mismatch as above
    const result = await _verifyAgentRequest(request, agentAuthInstance);
    if (!result) return null;
    return {
      agentId: result.agentId ?? result.agent?.id ?? "",
      userId: result.userId ?? result.user?.id ?? null,
      hostId: result.hostId ?? result.host?.id ?? "",
      capabilities: result.capabilities ?? [],
    };
  } catch {
    return null;
  }
}

/**
 * The list of capabilities the platform supports.
 * Useful for building UI or validating capability requests.
 */
export const platformCapabilities = PLATFORM_CAPABILITIES;

export type PlatformCapability = (typeof PLATFORM_CAPABILITIES)[number]["name"];
