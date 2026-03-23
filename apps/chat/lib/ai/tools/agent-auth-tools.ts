/**
 * Agent Auth Protocol tools for the chat flow (BRO-57)
 *
 * Wraps @auth/agent's AgentAuthClient + toAISDKTools adapter to expose
 * Agent Auth capabilities as AI SDK tools inside streamText().
 *
 * Tools allow the chat agent to:
 *  - search for capabilities across providers
 *  - connect to an Agent Auth-enabled service
 *  - execute capabilities with scoped agent JWTs
 *  - check agent connection status
 *
 * We filter the full 18-tool set down to the 7 tools most useful in a
 * chat context: search, connect_agent, execute_capability,
 * batch_execute_capabilities, agent_status, disconnect_agent,
 * and list_capabilities. The rest (key rotation, host enrollment,
 * JWT signing, etc.) are operational concerns not suited to chat.
 *
 * Storage: Each user gets an in-memory AgentAuthClient per request.
 * Connections are ephemeral (per-stream). Persistent agent connections
 * can be added later via a DB-backed Storage adapter.
 *
 * @see https://agent-auth-protocol.com/
 * @see https://www.npmjs.com/package/@auth/agent
 */

import {
  AgentAuthClient,
  MemoryStorage,
  getAgentAuthTools,
  filterTools,
  toAISDKTools,
} from "@auth/agent";
import type { Tool } from "ai";
import { createModuleLogger } from "@/lib/logger";

const log = createModuleLogger("tools:agent-auth");

/**
 * The subset of @auth/agent tools exposed in chat.
 *
 * Rationale:
 * - search: unified capability search across providers + directory
 * - connect_agent: register the chat agent with a discovered service
 * - execute_capability: invoke a capability with auto-signed JWTs
 * - batch_execute_capabilities: invoke multiple capabilities at once
 * - agent_status: check connection health (grants, expiry)
 * - disconnect_agent: cleanly revoke when done
 * - list_capabilities: browse all capabilities for a provider
 */
const CHAT_TOOL_ALLOWLIST = [
  "search",
  "connect_agent",
  "execute_capability",
  "batch_execute_capabilities",
  "agent_status",
  "disconnect_agent",
  "list_capabilities",
] as const;

/**
 * Create AI SDK-compatible Agent Auth tools for the current user session.
 *
 * Returns a `Record<string, Tool>` that can be spread into the `tools`
 * object passed to `streamText()`, plus a cleanup function to call when
 * the stream ends (tears down the AgentAuthClient).
 *
 * Tool names are prefixed with `agentAuth_` to avoid collisions with
 * base tools and MCP tools.
 */
export async function getAgentAuthSDKTools(_userId: string): Promise<{
  tools: Record<string, Tool>;
  cleanup: () => void;
}> {
  try {
    // Per-request client with in-memory storage.
    // Future: swap MemoryStorage for a DB-backed adapter keyed by userId
    // to persist agent connections across sessions.
    const client = new AgentAuthClient({
      storage: new MemoryStorage(),
      hostName: "Broomva Chat",
      // When an approval flow is needed (device auth), the tool execute
      // handler returns the approval info as structured output — the LLM
      // presents it to the user.
    });

    // Get the protocol-agnostic tool definitions
    const allAuthTools = getAgentAuthTools(client);

    // Filter to the chat-relevant subset
    const chatAuthTools = filterTools(allAuthTools, {
      only: [...CHAT_TOOL_ALLOWLIST],
    });

    // Convert to AI SDK format (uses jsonSchema from "ai" internally)
    const aiSdkToolMap = await toAISDKTools(chatAuthTools);

    // Namespace tools with agentAuth_ prefix to avoid collisions.
    // The @auth/agent AISDKTool type is structurally compatible with
    // ai's Tool but TypeScript needs the intermediate cast.
    const prefixedTools: Record<string, Tool> = {};
    for (const [name, tool] of Object.entries(aiSdkToolMap)) {
      prefixedTools[`agentAuth_${name}`] = tool as unknown as Tool;
    }

    log.info(
      { toolCount: Object.keys(prefixedTools).length },
      "Agent Auth tools initialized"
    );

    return {
      tools: prefixedTools,
      cleanup: () => {
        client.destroy();
      },
    };
  } catch (error) {
    log.error({ error }, "Failed to initialize Agent Auth tools");
    return {
      tools: {},
      cleanup: () => {},
    };
  }
}

/**
 * The tool names that Agent Auth contributes to the chat.
 * Used for activeTools filtering in core-chat-agent.ts.
 */
export const AGENT_AUTH_TOOL_NAMES = CHAT_TOOL_ALLOWLIST.map(
  (name) => `agentAuth_${name}`
);
