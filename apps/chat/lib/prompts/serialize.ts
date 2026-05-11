import "server-only";
import type { PromptInvocation, PromptFeedback } from "@/lib/db/schema";

/**
 * Convert a Drizzle PromptInvocation row to the snake_case API response
 * shape defined in docs/superpowers/specs/2026-05-09-prompts-eval-engine-design.md § 4.5.
 *
 * Used by:
 *  - GET /api/metrics/runs
 *  - PATCH /api/invocations/[id]
 */
export function serializeInvocation(row: PromptInvocation) {
  return {
    id: row.id,
    prompt_slug: row.promptSlug,
    prompt_version: row.promptVersion,
    source: row.source,
    caller: row.caller,
    user_id: row.userId,
    agent_id: row.agentId,
    session_id: row.sessionId,
    client_ip_hash: row.clientIpHash,
    variables: row.variables,
    status: row.status,
    model: row.model,
    latency_ms: row.latencyMs,
    tokens_in: row.tokensIn,
    tokens_out: row.tokensOut,
    cost_usd: row.costUsd === null ? null : Number(row.costUsd),
    error_message: row.errorMessage,
    external_trace_id: row.externalTraceId,
    external_span_id: row.externalSpanId,
    metadata: row.metadata,
    created_at: row.createdAt.toISOString(),
    completed_at: row.completedAt?.toISOString() ?? null,
  };
}

/**
 * Convert a Drizzle PromptFeedback row to the snake_case API response shape.
 *
 * Used by:
 *  - GET /api/feedback
 *  - (future) POST /api/feedback response — currently returns {id, created_at} which is already snake_case
 */
export function serializeFeedback(row: PromptFeedback) {
  return {
    id: row.id,
    invocation_id: row.invocationId,
    prompt_slug: row.promptSlug,
    prompt_version: row.promptVersion,
    user_id: row.userId,
    signal: row.signal,
    text: row.text,
    source: row.source,
    created_at: row.createdAt.toISOString(),
  };
}
