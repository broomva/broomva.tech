/**
 * Agent Auth client-side helper for CLI usage (BRO-56)
 *
 * Wraps the @auth/agent SDK to provide a simple interface for:
 *   - Registering a new agent identity (Ed25519 keypair)
 *   - Authenticating an existing agent via the device authorization flow
 *   - Signing outgoing HTTP requests with the agent's private key
 *
 * This module is designed for use in Node.js CLI processes (e.g. broomva-cli).
 * It is NOT imported by the Next.js server or browser bundles.
 *
 * @see https://agent-auth-protocol.com/
 */

import {
  AgentAuthClient,
  MemoryStorage,
  generateKeypair,
  signAgentJWT,
  type AgentAuthClientOptions,
  type AgentStatus,
  type Keypair,
  type CapabilityGrant,
} from "@auth/agent";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RegisterAgentResult {
  agentId: string;
  hostId: string;
  status: AgentStatus;
  capabilityGrants: CapabilityGrant[];
  keypair: Keypair;
  /** Device approval info — show to user if status is "pending" */
  approval?: {
    verificationUri: string;
    verificationUriComplete?: string;
    userCode?: string;
    expiresIn: number;
    interval: number;
  };
}

export interface LoginResult {
  agentId: string;
  status: AgentStatus;
  capabilityGrants: CapabilityGrant[];
}

export interface SignedHeaders {
  Authorization: string;
  "X-Agent-Id": string;
}

// ---------------------------------------------------------------------------
// Client factory
// ---------------------------------------------------------------------------

/**
 * Create a configured AgentAuthClient for a given server URL.
 *
 * Callers can optionally provide a storage backend for persisting keys.
 * Defaults to in-memory storage (suitable for single-run CLI sessions).
 */
export function createAgentClient(
  serverUrl: string,
  opts?: Partial<AgentAuthClientOptions>,
): AgentAuthClient {
  return new AgentAuthClient({
    storage: new MemoryStorage(),
    allowDirectDiscovery: true,
    hostName: opts?.hostName,
    onApprovalRequired: opts?.onApprovalRequired,
    onApprovalStatusChange: opts?.onApprovalStatusChange,
    approvalTimeoutMs: opts?.approvalTimeoutMs ?? 300_000,
    ...opts,
    // Pre-seed the provider so discovery is instant for our own platform
    providers: [
      ...(opts?.providers ?? []),
    ],
  });
}

// ---------------------------------------------------------------------------
// registerAgent — generate keypair, register with server, trigger device flow
// ---------------------------------------------------------------------------

/**
 * Register a new agent identity against the Broomva Platform.
 *
 * Steps:
 *   1. Discover the platform's Agent Auth configuration at `serverUrl`.
 *   2. Generate a fresh Ed25519 keypair.
 *   3. Call `connectAgent` which sends a registration request and, if the
 *      server requires device authorization, opens an approval flow.
 *   4. Return the agent ID, status, grants, and the keypair (caller should
 *      persist the private key securely).
 *
 * @param serverUrl   - Base URL of the Broomva Platform (e.g. "https://broomva.tech")
 * @param agentName   - Human-readable name for this agent (e.g. "broomva-cli on Macbook")
 * @param capabilities - Requested capability names (e.g. ["chat:send", "chat:read"])
 * @param opts        - Optional overrides for the AgentAuthClient
 */
export async function registerAgent(
  serverUrl: string,
  agentName: string,
  capabilities: string[] = [],
  opts?: Partial<AgentAuthClientOptions>,
): Promise<RegisterAgentResult> {
  const client = createAgentClient(serverUrl, {
    onApprovalRequired: (info) => {
      // Default handler: log instructions to stdout for CLI users
      if (typeof console !== "undefined") {
        console.log("\n--- Agent approval required ---");
        if (info.user_code) {
          console.log(`  Code: ${info.user_code}`);
        }
        if (info.verification_uri_complete) {
          console.log(`  Open: ${info.verification_uri_complete}`);
        } else if (info.verification_uri) {
          console.log(`  Open: ${info.verification_uri}`);
        }
        console.log(`  Expires in: ${info.expires_in}s\n`);
      }
    },
    ...opts,
  });

  try {
    // Discover + register + approval flow (blocking until approved or timeout)
    const result = await client.connectAgent({
      provider: serverUrl,
      capabilities: capabilities.map((name) => name),
      mode: "delegated",
      name: agentName,
    });

    // Retrieve the stored connection to get the keypair
    const connection = await client.getConnection(result.agentId);

    return {
      agentId: result.agentId,
      hostId: result.hostId,
      status: result.status,
      capabilityGrants: result.capabilityGrants,
      keypair: connection?.agentKeypair ?? await generateKeypair(),
    };
  } finally {
    client.destroy();
  }
}

// ---------------------------------------------------------------------------
// loginAsAgent — re-authenticate an existing agent
// ---------------------------------------------------------------------------

/**
 * Log in as an existing agent by checking its status on the server.
 *
 * The caller must already have the agent's keypair persisted locally.
 * This function creates a client, loads the agent connection from the
 * provided storage, and verifies status with the server.
 *
 * @param serverUrl - Base URL of the Broomva Platform
 * @param agentId   - The agent's ID (from a previous registration)
 * @param opts      - Must include a `storage` backend with the persisted connection
 */
export async function loginAsAgent(
  serverUrl: string,
  agentId: string,
  opts?: Partial<AgentAuthClientOptions>,
): Promise<LoginResult> {
  if (!opts?.storage) {
    throw new Error(
      "loginAsAgent requires a storage backend with the persisted agent connection.",
    );
  }

  const client = createAgentClient(serverUrl, opts);

  try {
    const status = await client.agentStatus(agentId);

    return {
      agentId: status.agent_id,
      status: status.status,
      capabilityGrants: status.agent_capability_grants,
    };
  } finally {
    client.destroy();
  }
}

// ---------------------------------------------------------------------------
// signRequest — produce Authorization headers for an outgoing HTTP request
// ---------------------------------------------------------------------------

/**
 * Sign an outgoing HTTP request with the agent's private key.
 *
 * Returns headers that the caller should merge into their fetch request.
 * The signed JWT is short-lived (60s) and scoped to the target URL.
 *
 * @param agentId    - The agent's ID
 * @param keypair    - The agent's Ed25519 keypair
 * @param url        - The target URL being called
 * @param audience   - The server's issuer URL (e.g. "https://broomva.tech")
 * @param capabilities - Optional capability scoping for the JWT
 */
export async function signRequest(
  agentId: string,
  keypair: Keypair,
  url: string,
  audience: string,
  capabilities?: string[],
): Promise<SignedHeaders> {
  const token = await signAgentJWT({
    agentKeypair: keypair,
    agentId,
    audience,
    capabilities,
    htm: "POST",
    htu: url,
    expiresInSeconds: 60,
  });

  return {
    Authorization: `Bearer ${token}`,
    "X-Agent-Id": agentId,
  };
}

// ---------------------------------------------------------------------------
// Utility: generate a deterministic agent key ID from a public key
// ---------------------------------------------------------------------------

/**
 * Derive a deterministic agent key ID from an Ed25519 public key.
 *
 * Takes the JWK `x` parameter (base64url-encoded), hashes it with SHA-256,
 * and returns the first 16 hex characters. This matches the convention used
 * by the /api/auth/agent/register endpoint.
 */
export async function deriveAgentKeyId(publicKeyX: string): Promise<string> {
  const data = new TextEncoder().encode(publicKeyX);
  const hash = await crypto.subtle.digest("SHA-256", data);
  const hex = Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex.slice(0, 16);
}

// Re-export useful types from @auth/agent for downstream consumers
export type { Keypair, AgentStatus, CapabilityGrant, AgentAuthClientOptions };
export { generateKeypair, MemoryStorage } from "@auth/agent";
