import "server-only";

import type { PlanTier } from "@/lib/stripe";
import { PLAN_TIERS } from "@/lib/stripe";

// ---------------------------------------------------------------------------
// Feature catalogue
// ---------------------------------------------------------------------------

export type TierFeature =
  | "all_models" // Pro+: access all AI models (free = community only)
  | "console" // Pro+: console dashboard access
  | "api_keys" // Pro+: create API keys
  | "deep_research" // Pro+: deep research agent skill
  | "priority_models" // Team+: priority model queue
  | "team_workspace" // Team+: shared workspace
  | "managed_life" // Enterprise: managed Life instance
  | "custom_domain" // Enterprise: custom subdomain
  | "sla_guarantee"; // Enterprise: SLA guarantees

const TIER_FEATURES: Record<PlanTier, TierFeature[]> = {
  free: [],
  pro: ["all_models", "console", "api_keys", "deep_research"],
  team: [
    "all_models",
    "console",
    "api_keys",
    "deep_research",
    "priority_models",
    "team_workspace",
  ],
  enterprise: [
    "all_models",
    "console",
    "api_keys",
    "deep_research",
    "priority_models",
    "team_workspace",
    "managed_life",
    "custom_domain",
    "sla_guarantee",
  ],
};

// ---------------------------------------------------------------------------
// Tier limits
// ---------------------------------------------------------------------------

const TIER_LIMITS: Record<
  PlanTier,
  { maxApiKeys: number; maxMembers: number }
> = {
  free: { maxApiKeys: 0, maxMembers: 1 },
  pro: { maxApiKeys: 1, maxMembers: 1 },
  team: { maxApiKeys: 10, maxMembers: 25 },
  enterprise: { maxApiKeys: -1, maxMembers: -1 }, // unlimited
};

// ---------------------------------------------------------------------------
// Free-tier model allowlist
// ---------------------------------------------------------------------------

/**
 * Community models available on the free tier.
 * Must be a superset of ANONYMOUS_LIMITS.AVAILABLE_MODELS — authenticated
 * free users should never be blocked from models that anonymous users can use.
 */
const FREE_TIER_MODELS = [
  "openai/gpt-5-nano",
  "openai/gpt-5-mini",
  "google/gemini-2.5-flash-lite",
  "google/gemini-3-flash",
  "anthropic/claude-haiku-4.5",
];

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/** Check whether a given plan has a specific feature. */
export function hasFeature(plan: string, feature: TierFeature): boolean {
  const features = TIER_FEATURES[plan as PlanTier];
  if (!features) return false;
  return features.includes(feature);
}

/** Return the numeric limits for a plan tier. */
export function getTierLimits(plan: string): {
  maxApiKeys: number;
  maxMembers: number;
} {
  return TIER_LIMITS[plan as PlanTier] ?? TIER_LIMITS.free;
}

/**
 * Determine whether a model is allowed for the given plan.
 * Free-tier users may only use models in FREE_TIER_MODELS.
 * All paid tiers have unrestricted model access.
 */
export function isModelAllowed(plan: string, modelId: string): boolean {
  if (hasFeature(plan, "all_models")) return true;
  return FREE_TIER_MODELS.includes(modelId);
}

/**
 * Check if the organisation can afford an estimated cost.
 *
 * @param planCreditsRemaining  Current credit balance (cents).
 * @param costEstimate          Optional estimated cost of the upcoming operation (cents).
 * @returns `allowed` — whether the spend can proceed,
 *          `remaining` — current balance,
 *          `upgradeRequired` — true when upgrade is the only option.
 */
export function canSpendCredits(
  planCreditsRemaining: number,
  costEstimate?: number,
): { allowed: boolean; remaining: number; upgradeRequired: boolean } {
  const remaining = planCreditsRemaining;
  const estimate = costEstimate ?? 0;

  if (remaining <= 0) {
    return { allowed: false, remaining, upgradeRequired: true };
  }

  if (estimate > 0 && remaining < estimate) {
    return { allowed: false, remaining, upgradeRequired: true };
  }

  return { allowed: true, remaining, upgradeRequired: false };
}

/**
 * Return a user-friendly upgrade message for the requested feature.
 */
export function getUpgradeMessage(feature: TierFeature): string {
  const messages: Record<TierFeature, string> = {
    all_models:
      "This model requires a Pro plan or higher. Upgrade at /pricing to unlock all AI models.",
    console:
      "The console dashboard is available on Pro plans and above. Upgrade at /pricing.",
    api_keys:
      "API key creation requires a Pro plan or higher. Upgrade at /pricing.",
    deep_research:
      "Deep research is a Pro feature. Upgrade at /pricing to access it.",
    priority_models:
      "Priority model access requires a Team plan or higher. Upgrade at /pricing.",
    team_workspace:
      "Shared workspaces are available on Team plans and above. Upgrade at /pricing.",
    managed_life:
      "Managed Life instances are an Enterprise feature. Contact sales for details.",
    custom_domain:
      "Custom domains are an Enterprise feature. Contact sales for details.",
    sla_guarantee:
      "SLA guarantees are available on Enterprise plans. Contact sales for details.",
  };

  return messages[feature];
}

/**
 * Return the full feature list for a plan.
 */
export function getTierFeatures(plan: string): TierFeature[] {
  return TIER_FEATURES[plan as PlanTier] ?? TIER_FEATURES.free;
}

/**
 * Return the monthly credit allocation for a plan.
 */
export function getTierCreditsMonthly(plan: string): number {
  return (
    PLAN_TIERS[plan as PlanTier]?.creditsMonthly ?? PLAN_TIERS.free.creditsMonthly
  );
}
