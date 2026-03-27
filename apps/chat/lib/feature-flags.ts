/**
 * Feature flags — BRO-207
 *
 * Runtime feature flags backed by PostHog with fallback to chat.config.ts.
 * PostHog flag names map 1:1 to the keys below.
 * Plan-tier targeting is configured in the PostHog dashboard using the
 * 'organization' group property 'plan'.
 */

import { PostHog } from "posthog-node";
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

/**
 * Fallback values from chat.config.ts for when PostHog is unavailable.
 * New flags default to false until explicitly enabled in PostHog.
 */
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

// ── Server-side client ────────────────────────────────────────────────────────

let _ph: PostHog | null = null;

function getServerPostHog(): PostHog | null {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return null;
  if (!_ph) {
    _ph = new PostHog(key, {
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
      flushAt: 1,
      flushInterval: 0,
    });
  }
  return _ph;
}

// ── Server helper ─────────────────────────────────────────────────────────────

/**
 * Evaluate a feature flag server-side for a given user.
 * Falls back to the static config value if PostHog is unavailable or errors.
 *
 * @param flag  - Feature flag key
 * @param userId - PostHog distinct ID (user.id or anonymous ID)
 * @param groups - Optional group memberships, e.g. { organization: orgId }
 */
export async function getServerFeatureFlag(
  flag: FeatureFlag,
  userId: string,
  groups?: Record<string, string>,
): Promise<boolean> {
  const ph = getServerPostHog();
  if (!ph) return STATIC_FALLBACKS[flag];

  try {
    const enabled = await ph.isFeatureEnabled(flag, userId, { groups });
    return enabled ?? STATIC_FALLBACKS[flag];
  } catch {
    return STATIC_FALLBACKS[flag];
  }
}

/**
 * Get the static fallback for a flag without making a network request.
 * Use this in non-async contexts or as a synchronous default.
 */
export function getStaticFeatureFlag(flag: FeatureFlag): boolean {
  return STATIC_FALLBACKS[flag];
}
