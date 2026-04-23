/**
 * Life Runtime — shared types for the /life/[project] surface.
 *
 * Mirrors the Drizzle schema (apps/chat/lib/db/schema.ts, LifeProject et al.)
 * but adds the runtime-only types (PaymentMode, ConsumerIdentity, RunEvent)
 * that don't live in the DB.
 */

import { z } from "zod";

/**
 * How a run is paid for. This is the single column that discriminates the
 * whole billing model described in BRO-846.
 */
export type PaymentMode =
  | "credits" // authed user with subscription credit balance
  | "x402" // anon / external / machine-to-machine, paid via x402 402-retry
  | "haima_balance" // authed user paying via pre-funded Haima wallet
  | "byok" // user supplies their own provider key, bypasses LLM cost accounting
  | "free_tier"; // platform-subsidized demo run (capped per project per day)

/** Who is running this — determines billing path + visibility. */
export type ConsumerKind = "user" | "anon" | "agent";

/** Resolved consumer identity for a single request. */
export interface ConsumerIdentity {
  kind: ConsumerKind;
  /** userId | anon session id | wallet address */
  id: string;
  /** Present only when an authed user has an organization context */
  organizationId?: string;
}

/**
 * The module_type registry — maps project.moduleTypeId to a concrete runner
 * implementation at the application layer. Extending this is how the platform
 * onboards new module types without schema changes.
 */
export type ModuleTypeId =
  | "sentinel-property-ops"
  | "materiales-intel"
  | "generic-rules-runner"
  | "module-builder"; // future

/**
 * Event types streamed from the runner over SSE. Subset maps to the Life
 * Interface UI (_components/ChatColumn, MiddleColumn.Journal, etc.). Any new
 * type requires UI to gracefully ignore unknown types — keeps the protocol
 * additive.
 */
export type RunEventType =
  | "run_started"
  | "thinking_start"
  | "thinking_delta"
  | "thinking_end"
  | "text_start"
  | "text_delta"
  | "text_end"
  | "tool_call"
  | "tool_result"
  | "fs_op"
  | "nous_score"
  | "autonomic_event"
  | "error"
  | "done";

export interface RunEvent {
  type: RunEventType;
  payload: Record<string, unknown>;
  at: string; // ISO timestamp
}

/**
 * Outcome of a billing decision, taken BEFORE the runner executes. Returned
 * by pickPaymentMode() in billing.ts.
 */
export interface BillingDecision {
  mode: PaymentMode;
  /** Expected cost in USD cents for this run (quoted to the consumer ahead of time). */
  quotedCents: number;
  /** Cap at which the runner aborts mid-run. */
  maxCostCents: number;
  /** If mode === "x402", the quote payload returned in the 402 Payment Required body. */
  paymentQuote?: {
    amount: number;
    currency: "USD";
    railsAccepted: Array<"usdc-base" | "bre-b" | "stripe">;
    nonce: string;
  };
  /** Human-readable explanation for the UI/logs. */
  rationale: string;
}

/**
 * Input envelope posted to /api/life/run/[project].
 */
export const RunRequestSchema = z.object({
  input: z.unknown().optional(),
  /** Optional override of the server-side default mode. */
  mode: z.enum(["mock", "live"]).optional(),
  /** When provided, run uses this BYOK key id (must belong to caller). */
  byokKeyId: z.string().uuid().optional(),
  /** Conversation session to continue; new session is created if absent. */
  sessionId: z.string().uuid().optional(),
  /** User chat message for this turn. Empty/missing = demo landing run. */
  message: z.string().max(4000).optional(),
});
export type RunRequest = z.infer<typeof RunRequestSchema>;
