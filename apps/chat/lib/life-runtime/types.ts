/**
 * Life Runtime — shared types for the /life/[project] surface.
 *
 * Mirrors the Drizzle schema (apps/chat/lib/db/schema.ts, LifeProject et al.)
 * but adds the runtime-only types (PaymentMode, ConsumerIdentity, RunnerYield)
 * that don't live in the DB.
 */

import type { TextStreamPart, ToolSet } from "ai";
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
 * Runner → emitter wire. Discriminated union separating two concerns that
 * were previously conflated under a single `RunEvent` type:
 *
 *   1. **LLM stream parts** ("kind: 'llm'") — AI SDK v6 `fullStream` items,
 *      passed through verbatim. Zero re-encoding. This gives us parallel
 *      tool-call correlation, Claude thinking signatures, source/file/raw
 *      parts, and per-step usage for free — anything AI SDK supports now or
 *      adds in the future flows end-to-end without a patch to the middle
 *      layer.
 *
 *   2. **Domain events** ("kind: 'domain'") — runtime-level things our agent
 *      emits *on top of* the LLM stream: workspace file operations, Nous
 *      self-evaluation, Autonomic pillar notes, aggregated cost/tokens.
 *      These are genuinely ours and don't belong in AI SDK's vocabulary.
 *
 * The rationale for this split is documented in
 * `docs/superpowers/specs/2026-04-24-life-runner-aisdk-passthrough.md`.
 *
 * The Prosopon emitter branches on `.kind` and routes each half to its own
 * translator, so new AI-SDK part types only require a single branch in
 * `translateLLMPart` (or a no-op pass) rather than a 4-file surgery.
 */

/**
 * The full AI SDK v6 `fullStream` part union, parameterised over any
 * `ToolSet`. Re-exported here so the rest of the runtime can import it from
 * one place; if AI SDK evolves to v7, this alias is the single update
 * point.
 */
export type LLMStreamPart = TextStreamPart<ToolSet>;

/**
 * Runtime-level events our agent emits alongside the LLM stream. Kept small
 * and stable; every variant has a well-defined payload contract that's
 * independent of any specific model / provider / SDK version.
 */
export type DomainEventType =
  | "run_started" // scene already reset by emitter.runStarted(); this is metadata-only
  | "fs_op" // workspace file op (from the `note` tool today; generic tool bridge later)
  | "nous_score" // self-eval emitted post-stream by the runner
  | "autonomic_event" // pillar note (economic / cognitive / operational)
  | "kernel.dispatch.started" // runner is about to invoke KernelClient.dispatch
  | "kernel.dispatch.completed" // KernelClient.dispatch returned (carries ResourceUsage)
  | "done" // aggregated per-run totals (cost, tokens, elapsed, finishReason)
  | "error"; // runtime-level error surface (separate from AI SDK `error` parts)

export interface DomainEvent {
  type: DomainEventType;
  payload: Record<string, unknown>;
  at: string; // ISO timestamp
}

export type RunnerYield =
  | { kind: "llm"; part: LLMStreamPart; at: string }
  | { kind: "domain"; event: DomainEvent };

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
