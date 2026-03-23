/**
 * Agent Auth Protocol API handler (BRO-54)
 *
 * Catch-all route that delegates to the Better Auth instance configured
 * with the @better-auth/agent-auth plugin. All agent-auth endpoints
 * (registration, session, capabilities, device auth, etc.) are handled here.
 *
 * Mounted at: /api/auth/agent-protocol/[...path]
 *
 * The plugin exposes endpoints like:
 *   GET  /api/auth/agent-protocol/agent-configuration  -- discovery
 *   POST /api/auth/agent-protocol/agent/register        -- register agent
 *   GET  /api/auth/agent-protocol/agent/session          -- verify session
 *   GET  /api/auth/agent-protocol/capability/list        -- list capabilities
 *   POST /api/auth/agent-protocol/capability/execute     -- execute capability
 *   POST /api/auth/agent-protocol/device/code            -- device auth flow
 *   ... and more (see @better-auth/agent-auth docs)
 *
 * @see https://agent-auth-protocol.com/
 */

import { toNextJsHandler } from "better-auth/next-js";
import { agentAuthInstance } from "@/lib/agent-auth";

export const { GET, POST } = toNextJsHandler(agentAuthInstance);
