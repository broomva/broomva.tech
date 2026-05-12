import "server-only";
import Stripe from "stripe";

/**
 * Lazy-initialized Stripe client.
 * Avoids crashing at build time when STRIPE_SECRET_KEY is not set.
 */
let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error("STRIPE_SECRET_KEY is not set");
    }
    _stripe = new Stripe(key);
  }
  return _stripe;
}

/** @deprecated Use getStripe() for lazy initialization */
export const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : (null as unknown as Stripe);

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
