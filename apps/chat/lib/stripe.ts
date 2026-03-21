import "server-only";
import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  // Use the SDK's default API version (2026-02-25.clover for stripe@20.x)
});

export const PLAN_TIERS = {
  free: { name: "Free", creditsMonthly: 50, priceId: null },
  pro: {
    name: "Pro",
    creditsMonthly: 5000,
    priceId: process.env.STRIPE_PRO_PRICE_ID ?? null,
  },
  team: {
    name: "Team",
    creditsMonthly: 20000,
    priceId: process.env.STRIPE_TEAM_PRICE_ID ?? null,
  },
  enterprise: { name: "Enterprise", creditsMonthly: 0, priceId: null }, // custom
} as const;

export type PlanTier = keyof typeof PLAN_TIERS;

/**
 * Resolve a Stripe Price ID back to a PlanTier name.
 * Returns "free" if no matching tier is found.
 */
export function tierFromPriceId(priceId: string): PlanTier {
  for (const [tier, config] of Object.entries(PLAN_TIERS)) {
    if (config.priceId && config.priceId === priceId) {
      return tier as PlanTier;
    }
  }
  return "free";
}
