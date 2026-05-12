import { NextResponse } from "next/server";

/**
 * GET /.well-known/agent-configuration
 *
 * Agent Auth Protocol discovery endpoint (BRO-54).
 * Tells agents how to authenticate with broomva.tech.
 *
 * This is the canonical discovery document. The @better-auth/agent-auth
 * plugin also serves its own discovery at
 *   /api/auth/agent-protocol/agent-configuration
 * but this well-known URL is the primary entry point per the AAP spec.
 *
 * @see https://agent-auth-protocol.com/
 */
export async function GET() {
  const baseUrl = process.env.APP_URL || "https://broomva.tech";
  const agentBase = `${baseUrl}/api/auth/agent-protocol`;

  return NextResponse.json(
    {
      // ── Agent Auth Protocol v1 (spec-compliant fields) ──────────────
      version: "1.0",
      provider: "broomva.tech",
      provider_name: "Broomva Platform",
      description:
        "Open AI platform for agents and humans — Agent OS, managed deployments, trust & credit infrastructure",
      issuer: baseUrl,
      homepage: baseUrl,

      // Plugin-generated discovery document (canonical source)
      // Available at: /api/auth/agent-protocol/agent-configuration
      default_location: `${agentBase}/capability/execute`,

      // Spec-required discovery endpoints (mirrors plugin output)
      endpoints: {
        register: `${agentBase}/agent/register`,
        capabilities: `${agentBase}/capability/list`,
        describe_capability: `${agentBase}/capability/describe`,
        execute: `${agentBase}/capability/execute`,
        request_capability: `${agentBase}/agent/request-capability`,
        status: `${agentBase}/agent/status`,
        reactivate: `${agentBase}/agent/reactivate`,
        revoke: `${agentBase}/agent/revoke`,
        revoke_host: `${agentBase}/host/revoke`,
        rotate_key: `${agentBase}/agent/rotate-key`,
        rotate_host_key: `${agentBase}/host/rotate-key`,
        introspect: `${agentBase}/agent/introspect`,
        device_code: `${agentBase}/device/code`,
      },

      // Supported registration modes
      modes: ["delegated", "autonomous"],

      // Supported key algorithms (JWK curve names per spec)
      algorithms: ["Ed25519"],

      // Approval methods
      approval_methods: ["device_authorization"],

      // ── Extended platform info (broomva-specific) ───────────────────

      // Agent identity endpoints (BRO-56 — register + status for CLI agents)
      agent: {
        register: `${baseUrl}/api/auth/agent/register`,
        status: `${baseUrl}/api/auth/agent/status`,
      },

      // Legacy auth methods (existing device flow, API tokens, JWT refresh)
      auth: {
        // Device code flow (RFC 8628) — for CLIs and headless agents
        device_code: {
          endpoint: `${baseUrl}/api/auth/device/code`,
          token_endpoint: `${baseUrl}/api/auth/device/token`,
          authorization_endpoint: `${baseUrl}/device`,
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
          polling_interval: 5,
          expires_in: 900,
        },

        // API token — for server-to-server
        api_token: {
          endpoint: `${baseUrl}/api/auth/api-token`,
          header: "Authorization",
          scheme: "Bearer",
        },

        // JWT refresh flow
        refresh: {
          endpoint: `${baseUrl}/api/auth/refresh`,
          revoke_endpoint: `${baseUrl}/api/auth/revoke`,
          access_token_ttl: "24h",
          refresh_token_ttl: "7d",
        },
      },

      // Agent capabilities
      capabilities: [
        "chat:send",
        "chat:read",
        "organization:read",
        "organization:write",
        "usage:read",
        "deployment:read",
        "deployment:write",
        "memory:read",
        "memory:write",
        "trust:read",
      ],

      // MCP integration
      mcp: {
        supported: true,
        documentation: `${baseUrl}/docs/api-reference/life-services`,
      },

      // Life services (for agents that want to connect to the Agent OS)
      services: {
        arcan: {
          url: (process.env.ARCAN_URL || "https://arcan.la").trim(),
          description: "Agent runtime daemon",
        },
        lago: {
          url: (process.env.LAGO_URL || "https://api.lago.arcan.la").trim(),
          description: "Event-sourced persistence substrate",
        },
        autonomic: {
          url: "https://autonomicd-production-571a.up.railway.app",
          description: "Homeostasis controller — trust scoring",
        },
        haima: {
          url: "https://haimad-production.up.railway.app",
          description: "Agentic finance engine — x402 payments",
        },
      },

      // Trust scoring
      trust: {
        endpoint:
          "https://autonomicd-production-571a.up.railway.app/trust-score",
        tiers: ["unverified", "provisional", "trusted", "certified"],
      },

      // Documentation
      documentation: "https://docs.broomva.tech/docs",

      // Contact
      contact: {
        email: "hello@broomva.tech",
        github: "https://github.com/broomva",
      },
    },
    {
      headers: {
        "Cache-Control": "public, max-age=3600",
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}
