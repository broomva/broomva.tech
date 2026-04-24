/**
 * Life Runtime — billing decision layer.
 *
 * Determines which PaymentMode applies to a given (project × consumer × key)
 * triple BEFORE the runner executes. The decision gets stamped on the
 * LifeRun row so traceability is total.
 *
 * Decision matrix (per BRO-846 / refined commercial model):
 *
 *   ┌───────────────────────┬─────────────────────┬─────────────────────────┐
 *   │ Consumer              │ Project             │ Mode                    │
 *   ├───────────────────────┼─────────────────────┼─────────────────────────┤
 *   │ Authed user (owner)   │ any                 │ credits (internal)      │
 *   │ Authed user           │ free public         │ free_tier               │
 *   │ Authed user           │ paid public         │ haima_balance           │
 *   │ Authed user + BYOK    │ any                 │ byok                    │
 *   │ Anon / external       │ free public         │ free_tier (anon quota)  │
 *   │ Anon / external       │ paid public         │ x402 (402 Payment Req)  │
 *   │ Anon / external       │ private or draft    │ 403 (no access)         │
 *   └───────────────────────┴─────────────────────┴─────────────────────────┘
 *
 * Schema ready: all modes land in LifeRun.paymentMode column. Actual wallet
 * settlement (x402 / Haima) wires in follow-up PRs; this layer returns the
 * decision + a 402 quote when needed.
 */

import "server-only";
import { randomUUID } from "node:crypto";
import { deductCredits, getCredits } from "@/lib/db/credits";
import type { LifeProject } from "@/lib/db/schema";
import type { BillingDecision, ConsumerIdentity, PaymentMode } from "./types";

/**
 * Pricing config shape (matches projects.pricing JSONB column).
 * `null` on the project row means "free-during-launch".
 */
export interface PricingConfig {
  model: "per_run" | "per_token" | "tiered" | "free";
  rail: "usdc-base" | "bre-b" | "stripe" | "x402-any";
  consumerPriceCents: number;
  maxCostCents: number;
  creatorSharePct: number;
  platformFeePct: number;
  creatorSubsidyCents?: number;
  freeRunsPerMonthPerConsumer?: number;
  currency: "USD";
}

/** Default envelope for free / null-pricing projects (sentinel + materiales today). */
const DEFAULT_FREE_TIER = {
  quotedCents: 0,
  maxCostCents: 50, // $0.50 hard cap — abort runaway mock or real calls
  consumerPriceCents: 0,
};

/**
 * Decide how this run will be paid for. Pure function over inputs + an optional
 * BYOK hint; does NOT side-effect (no credit debit here, see `settleCreditsDebit`).
 */
export function pickPaymentMode(args: {
  project: LifeProject;
  consumer: ConsumerIdentity;
  byokKeyId?: string;
}): BillingDecision {
  const { project, consumer, byokKeyId } = args;
  const pricing = (project.pricing as PricingConfig | null) ?? null;
  const isPaid =
    pricing && pricing.model !== "free" && pricing.consumerPriceCents > 0;

  // BYOK overrides everything — consumer provides the LLM billing rail.
  if (byokKeyId) {
    return {
      mode: "byok",
      quotedCents: 0,
      maxCostCents: pricing?.maxCostCents ?? DEFAULT_FREE_TIER.maxCostCents,
      rationale:
        "BYOK key supplied — LLM cost billed to consumer's own provider.",
    };
  }

  // Authed project owner: always platform credits (their own subscription).
  if (
    consumer.kind === "user" &&
    (project.ownerKind === "user" || project.ownerKind === "org") &&
    project.ownerId === (consumer.organizationId ?? consumer.id)
  ) {
    return {
      mode: "credits",
      quotedCents: pricing?.consumerPriceCents ?? 1, // nominal 1c for self-runs
      maxCostCents: pricing?.maxCostCents ?? DEFAULT_FREE_TIER.maxCostCents,
      rationale:
        "Project owner running own agent — debited from subscription credits.",
    };
  }

  // Free public project (sentinel + materiales during launch): free_tier, capped.
  if (!isPaid && project.visibility === "public") {
    return {
      mode: "free_tier",
      quotedCents: 0,
      maxCostCents: DEFAULT_FREE_TIER.maxCostCents,
      rationale: "Free public project — platform-subsidized demo run.",
    };
  }

  // Paid public project, authed consumer: Haima pre-debit (wallet settlement is
  // a follow-up PR; this mode tags the run so we know to reconcile later).
  if (isPaid && consumer.kind === "user") {
    return {
      mode: "haima_balance",
      quotedCents: pricing.consumerPriceCents,
      maxCostCents: pricing.maxCostCents,
      rationale: "Paid public project — debited from consumer's Haima balance.",
    };
  }

  // Paid public project, anon / external / agent: 402 Payment Required with quote.
  if (isPaid && (consumer.kind === "anon" || consumer.kind === "agent")) {
    return {
      mode: "x402",
      quotedCents: pricing.consumerPriceCents,
      maxCostCents: pricing.maxCostCents,
      paymentQuote: {
        amount: pricing.consumerPriceCents,
        currency: "USD",
        railsAccepted: parseRails(pricing.rail),
        nonce: randomUUID(),
      },
      rationale: "External caller on paid project — x402 Payment Required.",
    };
  }

  // Free public + anon: free_tier under a strict anon quota (future: rate-limit via
  // existing apps/chat/lib/utils/rate-limit.ts with keyPrefix 'life:run:anon').
  return {
    mode: "free_tier",
    quotedCents: 0,
    maxCostCents: DEFAULT_FREE_TIER.maxCostCents,
    rationale: "Free public project, anon caller — anon free-tier quota.",
  };
}

function parseRails(
  rail: PricingConfig["rail"],
): Array<"usdc-base" | "bre-b" | "stripe"> {
  switch (rail) {
    case "usdc-base":
      return ["usdc-base"];
    case "bre-b":
      return ["bre-b"];
    case "stripe":
      return ["stripe"];
    case "x402-any":
      return ["usdc-base", "bre-b", "stripe"];
  }
}

/**
 * Settle a run's cost against credits. Called post-run once the real LLM cost
 * is known. For mock-replay runs cost is 0 and this is a no-op.
 *
 * Returns the actual debited amount; may be less than requested if user is
 * near the overdraft floor (existing deductCredits caps overdraft at $1).
 */
export async function settleCreditsDebit(args: {
  userId: string;
  mode: PaymentMode;
  amountCents: number;
}): Promise<number> {
  if (args.amountCents <= 0) return 0;
  if (args.mode !== "credits") return 0; // other modes settle elsewhere

  await deductCredits(args.userId, args.amountCents);
  return args.amountCents;
}

/** Quick balance check — used by the API route to pre-flight the decision. */
export async function userHasCreditsFor(
  userId: string,
  amountCents: number,
): Promise<boolean> {
  if (amountCents <= 0) return true;
  const balance = await getCredits(userId);
  return balance >= amountCents;
}
