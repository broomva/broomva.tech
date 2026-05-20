/**
 * Sticky-session derivation for the `/api/v1/messages` edge endpoint.
 *
 * Decision D1 (locked in PR-1 of BRO-1208): the Anthropic + OpenAI wire
 * shapes don't carry a `session_id` field, but lifed's WS bridge needs a
 * stable sid per conversation (the routing cache populates on
 * `Agent.CreateSession`, then `Agent.StreamSession` matches against it).
 *
 * The trick: hash everything in `messages[]` EXCEPT the latest entry. The
 * latest entry is the user's current turn; everything before it is the
 * conversation history. Two requests in the same conversation differ only
 * in the latest entry; both produce the SAME prefix hash; both resolve to
 * the same sid. A brand-new conversation has either an empty prefix
 * (first turn — single user message) or a different prefix; new sid.
 *
 * The hash input is canonical-serialised JSON so the same logical messages
 * always produce the same byte sequence (Node's JSON.stringify is stable
 * for objects with the same key insertion order; we sort keys explicitly
 * to be safe against client-side key reordering).
 *
 * Spec: docs/superpowers/specs/2026-05-20-anthropic-openai-edge-endpoints.md
 *       (Decision D1 — sticky-session hash strategy)
 */

import "server-only";
import { createHash } from "node:crypto";
import type { AnthropicMessage } from "./types";

/**
 * Compute the sticky session id for a request.
 *
 * - If `messages.length === 0` or `messages.length === 1`, the prefix is
 *   empty and the hash collapses to a single deterministic constant. That
 *   constant is acceptable as the sid for the FIRST turn of a brand-new
 *   conversation — lifed will create a fresh session on `resume_sid` miss.
 *   But two distinct first-turn conversations would collide on this sid,
 *   so when `messages.length <= 1` we mix in a SECOND hash domain — the
 *   latest message content itself — so distinct opens get distinct sids.
 *
 *   For `messages.length >= 2`, the prefix `messages[:-1]` is the
 *   stable carrier across turns; the latest entry varies but is excluded
 *   from the hash. Subsequent turns reuse the same sid.
 *
 * - Returns 32 hex characters (truncated SHA-256). That's 128 bits of
 *   entropy — enough to avoid collisions across billions of sessions and
 *   short enough to stay readable in logs.
 */
export function buildStickySessionId(messages: AnthropicMessage[]): string {
  const prefix = messages.slice(0, Math.max(0, messages.length - 1));

  const h = createHash("sha256");
  if (prefix.length === 0) {
    // First turn of a brand-new conversation. The latest message is the
    // ONLY signal we have — mix it in so distinct openers don't collide.
    // The downstream lifed Agent.CreateSession sees this as a `resume_sid`
    // and either resumes an existing session (re-open with the same first
    // user message) or creates a fresh one (`not_found`).
    h.update("anthropic-messages-v1:cold-open\n");
    const last = messages[messages.length - 1];
    if (last) {
      h.update(canonicalize(last));
    }
  } else {
    h.update("anthropic-messages-v1:prefix\n");
    for (const m of prefix) {
      h.update(canonicalize(m));
      h.update("\n");
    }
  }

  return h.digest("hex").slice(0, 32);
}

/**
 * Canonical JSON serialiser — sorts object keys recursively so the same
 * logical value produces the same byte sequence regardless of client-side
 * key ordering. Arrays preserve order (semantically meaningful).
 */
function canonicalize(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      out[key] = sortKeys(obj[key]);
    }
    return out;
  }
  return value;
}
