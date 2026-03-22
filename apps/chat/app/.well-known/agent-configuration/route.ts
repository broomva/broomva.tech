import { NextResponse } from "next/server";

/**
 * GET /.well-known/agent-configuration
 *
 * Agent Auth Protocol discovery endpoint.
 * Tells agents how to authenticate with broomva.tech.
 *
 * @see https://agent-auth-protocol.com/
 */
export async function GET() {
  const baseUrl = process.env.APP_URL || "https://broomva.tech";

  return NextResponse.json(
    {
      // Agent Auth Protocol v1
      version: "1.0",

      // Platform identity
      name: "BroomVA Platform",
      description:
        "Open AI platform for agents and humans — Agent OS, managed deployments, trust & credit infrastructure",
      homepage: baseUrl,

      // Authentication methods
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
        lago: {
          url: process.env.LAGO_URL || "https://lago.broomva.tech",
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
