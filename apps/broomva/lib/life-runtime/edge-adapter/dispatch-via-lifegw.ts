/**
 * Dispatch a chat turn through lifegw and yield canonical agent events.
 *
 * Third sub-PR of BRO-1208. Mirrors the auth + create-session + stream
 * pattern shipped in `/api/v1/messages` (PR-1, #188) and `/api/v1/chat/
 * completions` (PR-2, #190), exposed as a reusable helper so the in-app
 * `/api/chat` route can route through lifegw without reimplementing the
 * WS wiring.
 *
 * The helper is intentionally narrow:
 *
 *   1. Mint a Tier-1 cap for the consumer (`user:<id>` or
 *      `anon:<session.id>`) via `mintTier1ForConsumer`.
 *   2. Call `LifedWsAgentSessionClient.createSession({ resumeSid, ... })`
 *      with the sticky sid the caller supplies. lifed creates a fresh
 *      session or resumes the existing one with the same sid.
 *   3. Open the per-turn stream and return the `AsyncIterable<
 *      CanonicalAgentEvent>` so the caller can translate to whatever
 *      wire format their UI expects (Anthropic SSE, OpenAI SSE,
 *      Vercel-AI-SDK data-stream SSE).
 *
 * Decisions (locked in this PR):
 *
 *   - **Anonymous flow preserved**: anon callers mint Tier-0 (`tier:
 *     "anon"`) caps. If lifegw rejects Tier-0, the anon flow breaks
 *     visibly and we patch in a follow-up — but unilaterally dropping
 *     anon would harm the signup funnel.
 *   - **Sticky sid is per-chat**: the in-app chat UI passes `chatId`
 *     (UUID) in the body; we forward THAT as `resumeSid` so a single
 *     chat thread resolves to the same lifed session across turns.
 *     This is intentionally different from `/api/v1/messages`, which
 *     uses `buildStickySessionId(messages)` because external API callers
 *     don't have a stable session id to send.
 *   - **Per-turn mode only**: PR-3 keeps the per-turn semantics
 *     (`multiTurn !== true`). Multi-turn opt-in is a later concern;
 *     the in-app chat already uses a fresh HTTP request per turn.
 *   - **Project slug**: defaults to `default` (matching the auth helper)
 *     unless the caller supplies one. Future work can map per-chat
 *     `projectId` to a lifegw project slug.
 *
 * Spec: docs/superpowers/specs/2026-05-20-anthropic-openai-edge-endpoints.md
 *       (extended by the BRO-1208 arc to cover the in-app surface)
 */

import "server-only";
import { mintTier1ForConsumer } from "@/lib/auth/lifegw-jwt";
import { LifedWsAgentSessionClient } from "@/lib/life-runtime/agent-session/lifed-ws-client";
import type { CanonicalAgentEvent } from "@/lib/life-runtime/agent-session/types";
import type { ConsumerIdentity } from "@/lib/life-runtime/types";

/**
 * Factory injection point for tests. Production code lets this be
 * `undefined`; tests assign a mock that returns a stubbed
 * `LifedWsAgentSessionClient`.
 */
export type SessionClientFactory = (
  baseUrl: string,
) => LifedWsAgentSessionClient;

/**
 * Reads `LIFED_GATEWAY_URL`. Returns null when unset — the route should
 * treat this as a configuration error and surface a 503-shaped response.
 */
export function getLifegwBaseUrl(): string | null {
  const url = process.env.LIFED_GATEWAY_URL;
  return url && url.length > 0 ? url : null;
}

/**
 * Result of opening a lifegw-routed dispatch — the canonical event
 * stream plus the resolved sid (lifed may have minted fresh when the
 * `resumeSid` wasn't recognized).
 */
export interface LifegwDispatchHandle {
  /** The session id lifed returned. Usually equals `input.stickySid`. */
  sessionId: string;
  /** Per-turn canonical event iterator. Exactly one `finish` at the end. */
  events: AsyncIterable<CanonicalAgentEvent>;
}

export interface DispatchViaLifegwInput {
  /**
   * Stable id for the lifed session. For the in-app `/api/chat` route
   * this is the chatId (UUID); for external API routes it's the hash
   * derived via `buildStickySessionId(messages)`.
   */
  stickySid: string;
  /**
   * The current turn's user text — the literal string lifed sends to
   * the LLM. The caller is responsible for extracting it from whatever
   * shape its inbound message uses (Anthropic blocks, Vercel-AI-SDK
   * parts, OpenAI strings, etc.).
   */
  userMessage: string;
  /**
   * Consumer identity — `user:<id>` for authenticated, `anon:<id>` for
   * anonymous. Drives both the Tier-1 subject and the agentId we pass
   * to lifed.
   */
  consumer: ConsumerIdentity;
  /** Project slug for the cap and the lifed session. Defaults to `default`. */
  projectSlug?: string;
  /** Aborts both the create_session HTTP call and the WS stream. */
  signal?: AbortSignal;
  /**
   * Test seam — when set, used instead of `new LifedWsAgentSessionClient`.
   * Production callers leave this undefined.
   */
  clientFactory?: SessionClientFactory;
}

/**
 * Open a lifegw dispatch for one chat turn.
 *
 * Throws if lifegw is unconfigured (`LIFED_GATEWAY_URL` unset) or if
 * `createSession` fails — the caller decides whether to surface that as
 * a 5xx, fall back, or retry. Per-turn errors *inside* the stream are
 * yielded as `{ kind: "error" }` canonical events (followed by the
 * mandatory terminal `finish`); the helper does not retry mid-stream.
 */
export async function dispatchViaLifegw(
  input: DispatchViaLifegwInput,
): Promise<LifegwDispatchHandle> {
  const baseUrl = getLifegwBaseUrl();
  if (!baseUrl) {
    throw new Error(
      "lifegw is not configured for this deployment (LIFED_GATEWAY_URL unset).",
    );
  }

  const projectSlug = input.projectSlug ?? "default";
  const subjectId = subjectFromConsumer(input.consumer);

  // 1. Mint a fresh Tier-1 cap. The auth.ts helper does the same for
  //    external API callers; we mint inline here because the in-app
  //    route has its OWN auth resolution (anon + session + bearer) and
  //    we want to pass the consumer kind explicitly so anon stays
  //    `tier: "anon"`.
  const cap = await mintTier1ForConsumer({
    consumer: input.consumer,
    projectSlug,
  });

  // 2. Construct the WS client. Tests inject a fake via clientFactory.
  const client = input.clientFactory
    ? input.clientFactory(baseUrl)
    : new LifedWsAgentSessionClient({ baseUrl });

  // 3. Open (or resume) the lifed session via the HTTP/JSON wrapper.
  //    lifed creates a fresh session when resumeSid isn't in its
  //    routing cache; subsequent turns with the same sid hit the cache
  //    and reuse the existing session — the per-chat continuity invariant.
  const session = await client.createSession({
    capability: { token: cap.token },
    userId: subjectId,
    projectSlug,
    resumeSid: input.stickySid,
    signal: input.signal,
  });

  const sessionId = session.sid;

  // 4. Open the per-turn streaming WS. Returns the canonical iterator.
  //    history=[] because lifed accumulates conversation context server-
  //    side via the sticky sid (D1, matches /api/v1/messages).
  const events = client.stream({
    sessionId,
    agentId: `user:${subjectId}`,
    projectSlug,
    userMessage: input.userMessage,
    history: [],
    kernelCtx: {
      sessionId,
      agentId: `user:${subjectId}`,
    },
    capability: {
      token: cap.token,
      expiresAt: cap.expiresAt,
    },
    signal: input.signal,
  });

  return { sessionId, events };
}

function subjectFromConsumer(consumer: ConsumerIdentity): string {
  switch (consumer.kind) {
    case "user":
      return consumer.id;
    case "anon":
      return `anon:${consumer.id}`;
    case "agent":
      return `agent:${consumer.id}`;
  }
}
