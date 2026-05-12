/**
 * AgentSession barrel — single import point for callers (the
 * canonical runtime, the route, tests).
 *
 *   import {
 *     createAgentSessionClient,
 *     type AgentSessionClient,
 *     type CanonicalAgentEvent,
 *     type AgentEvent,
 *   } from "@/lib/life-runtime/agent-session";
 *
 * Spec: docs/superpowers/specs/2026-05-03-life-runtime-canonical.md
 */

export {
  createAgentSessionClient,
  type CreateAgentSessionClientOverrides,
} from "./factory";
export {
  InProcessAgentSessionClient,
  type InProcessAgentSessionClientDeps,
} from "./in-process-client";
export {
  LifedWsAgentSessionClient,
  type LifedWsAgentSessionClientDeps,
  type WebSocketFactory,
} from "./lifed-ws-client";
export type {
  AgentEvent,
  AgentSessionBackendId,
  AgentSessionClient,
  AgentSessionHealth,
  AgentStreamInput,
  CanonicalAgentEvent,
  TierUserCap,
} from "./types";
