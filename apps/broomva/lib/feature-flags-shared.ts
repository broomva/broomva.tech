/**
 * Feature flags — shared types and static fallbacks (client-safe)
 *
 * This file is safe to import from both client and server code.
 * Server-only PostHog evaluation lives in feature-flags.ts.
 */

import { config } from "@/lib/config";

// ── Flag name union ───────────────────────────────────────────────────────────

/** All feature flags. Names match PostHog flag keys. */
export type FeatureFlag =
  // Existing features (mirrors chat.config.ts features.*)
  | "sandbox"
  | "web_search"
  | "url_retrieval"
  | "deep_research"
  | "mcp"
  | "image_generation"
  | "attachments"
  | "followup_suggestions"
  | "knowledge_graph"
  | "memory_vault"
  | "agent_auth"
  // New plan-gated flags
  | "marketplace_enabled"
  | "trust_api_enabled"
  | "managed_deployments";

// ── Static fallback map ───────────────────────────────────────────────────────

const STATIC_FALLBACKS: Record<FeatureFlag, boolean> = {
  sandbox: config.features.sandbox,
  web_search: config.features.webSearch,
  url_retrieval: config.features.urlRetrieval,
  deep_research: config.features.deepResearch,
  mcp: config.features.mcp,
  image_generation: config.features.imageGeneration,
  attachments: config.features.attachments,
  followup_suggestions: config.features.followupSuggestions,
  knowledge_graph: config.features.knowledgeGraph,
  memory_vault: config.features.memoryVault,
  agent_auth: config.features.agentAuth,
  marketplace_enabled: false,
  trust_api_enabled: false,
  managed_deployments: false,
};

/**
 * Get the static fallback for a flag without making a network request.
 * Safe to use in client components.
 */
export function getStaticFeatureFlag(flag: FeatureFlag): boolean {
  return STATIC_FALLBACKS[flag];
}
