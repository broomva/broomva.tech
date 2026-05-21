/**
 * Translate canonical `CanonicalAgentEvent` iterators into Vercel-AI-SDK
 * data-stream chunks.
 *
 * Third sub-PR of BRO-1208. The in-app chat surface (`/api/chat`) uses
 * the Vercel AI SDK's `useChat()` hook, which expects a specific
 * `UIMessageChunk` shape served via `JsonToSseTransformStream`. The old
 * dispatch went through `streamText` → `result.toUIMessageStream()`, so
 * the chunk shape was emitted natively by the SDK. With dispatch moving
 * to lifegw, we receive canonical `AgentEvent`s from lifed and must
 * project them onto the same `UIMessageChunk` shape so the client
 * (`components/chat-sync.tsx`) keeps working unchanged.
 *
 * The translation is mostly one-to-one:
 *
 *   AgentEvent.kind                   ➜ UIMessageChunk.type
 *   ────────────────────────────────────────────────────────────────
 *   text_start                        ➜ text-start { id }
 *   token                             ➜ text-delta { id, delta }
 *   text_end                          ➜ text-end { id }
 *   tool_call_pending                 ➜ tool-input-start + tool-input-available
 *   tool_result                       ➜ tool-output-available | tool-output-error
 *   finish                            ➜ (delegated — message-metadata + finish)
 *   warning                           ➜ (suppressed — telemetry only)
 *   error                             ➜ error { errorText }
 *
 * Edge cases handled:
 *
 *   - Lifed may emit `token` events without a preceding `text_start`
 *     (legacy / partial decoders). We synthesise `text-start` lazily
 *     using a stable per-stream id so the client renders one cohesive
 *     text part rather than orphan deltas.
 *   - Multiple `text_start` / `text_end` pairs (re-segmented assistant
 *     turns) are passed through as distinct text-id segments — the SDK
 *     handles this natively.
 *   - Tool input is forwarded as JSON-parsed `input`. If lifed sends a
 *     malformed `inputJson`, we fall back to passing the raw string in
 *     a `{ raw: "<string>" }` wrapper rather than failing the stream.
 *   - The terminal `finish` carries `usage` if lifed reported it; we
 *     surface that on the message metadata so cost accumulators (and
 *     PostHog telemetry downstream) see the same shape the SDK used to
 *     emit.
 *
 * The translator does NOT emit `start` or `message-metadata` chunks
 * itself — those are owned by the `createUIMessageStream` wrapper in
 * the route, which is also where `data-chatConfirmed` etc. live. The
 * translator only handles per-token-and-tool events from lifed.
 *
 * Spec: docs/superpowers/specs/2026-05-20-anthropic-openai-edge-endpoints.md
 *       (extended for the in-app chat surface, see BRO-1208 arc)
 */

import "server-only";
import type { InferUIMessageChunk, UIMessage } from "ai";
import type {
  AgentEvent,
  CanonicalAgentEvent,
} from "@/lib/life-runtime/agent-session/types";

/**
 * Per-stream state captured while consuming the canonical iterator.
 * The caller reads this AFTER the iterator drains to populate the
 * persisted assistant message + the finish chunk's metadata.
 */
export interface CanonicalConsumeState {
  /**
   * Concatenated assistant text — the persisted message body. Lifegw
   * sends per-token deltas; we accumulate so the route's onFinish can
   * write a fully materialised assistant message to the DB.
   */
  text: string;
  /**
   * Tool calls observed mid-stream. The route records these on the
   * assistant message's parts so the UI can replay them on reload.
   */
  toolCalls: Array<{
    callId: string;
    toolName: string;
    input: unknown;
    output?: unknown;
    isError?: boolean;
  }>;
  /**
   * Finish reason as reported by lifed (`stop` / `tool_use` / `error`
   * / `aborted` / ...). Mapped onto the SDK's `FinishReason` union by
   * the caller.
   */
  finishReason: string;
  /**
   * Usage tallies populated from lifed's terminal `finish` event. The
   * route forwards these into the cost accumulator (when the user is
   * authenticated) and reports them on the message metadata chunk.
   */
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    costCents?: number;
  };
  /**
   * Non-fatal warnings the iterator surfaced. Currently logged-only —
   * the SDK has no first-class warning chunk type, and the canonical
   * `warning` kind is reserved for telemetry that shouldn't surface in
   * the UI as an error.
   */
  warnings: Array<{ code: string; message: string }>;
  /**
   * Set when a fatal `error` canonical event terminated the stream.
   * The route uses this to clear `activeStreamId` on the persisted
   * assistant message so the client doesn't try to resume a dead
   * stream on reload.
   */
  error?: { code: string; message: string };
}

/**
 * Produce a fresh consume-state record. Exposed so the route can hold
 * a reference and inspect it inside `onFinish` (the translator mutates
 * the same object on each event).
 */
export function makeConsumeState(): CanonicalConsumeState {
  return {
    text: "",
    toolCalls: [],
    finishReason: "stop",
    warnings: [],
  };
}

export interface ConsumeOptions {
  /**
   * Stable id used for the synthesised `text-start` / `text-delta`
   * chunks when lifed emits `token` without a prior `text_start`.
   * Should be the assistant message id so the SDK threads deltas onto
   * the same UI part. Required because the SDK's text id is what
   * correlates the `text-end` close.
   */
  fallbackTextId: string;
  /**
   * Mutable state record the translator writes into. Caller usually
   * gets one from `makeConsumeState()` and reads it inside the wrapping
   * `createUIMessageStream`'s `onFinish` callback. May be omitted for
   * fire-and-forget consumers (e.g. tests).
   */
  state?: CanonicalConsumeState;
}

/**
 * Async generator — consumes the canonical iterator and yields
 * Vercel-AI-SDK `UIMessageChunk`s. Callers usually `dataStream.write`
 * each yielded chunk into a `createUIMessageStream` writer.
 *
 * Parameterised on the UI message type so the chunk shape matches
 * exactly what the writer expects (default `UIMessageChunk` is wider
 * than `InferUIMessageChunk<ChatMessage>` because it allows arbitrary
 * `data-${string}` payloads).
 */
export async function* canonicalToVercelAiSdkSse<
  UI_MESSAGE extends UIMessage = UIMessage,
>(
  events: AsyncIterable<CanonicalAgentEvent>,
  opts: ConsumeOptions,
): AsyncIterable<InferUIMessageChunk<UI_MESSAGE>> {
  type Chunk = InferUIMessageChunk<UI_MESSAGE>;
  const state = opts.state ?? makeConsumeState();
  // Tracks whether we already opened a text part this turn. When lifed
  // emits tokens without `text_start`, we lazy-open one and close it at
  // the finish boundary. When lifed DOES emit `text_start`, we honour
  // its messageId so multiple segments thread independently.
  let openTextId: string | null = null;
  // Tracks tool calls whose `tool-input-start` we've emitted; lets us
  // skip duplicate starts if lifed re-emits a pending event for the
  // same callId (shouldn't happen but is cheap defence).
  const startedToolCalls = new Set<string>();

  const closeOpenText = function* (): Iterable<Chunk> {
    if (openTextId !== null) {
      yield { type: "text-end", id: openTextId } as unknown as Chunk;
      openTextId = null;
    }
  };

  for await (const envelope of events) {
    const ev: AgentEvent = envelope.event;
    switch (ev.kind) {
      case "text_start": {
        // Honour lifed's correlation id; close any synthesised open
        // text first so segments don't leak into each other.
        yield* closeOpenText();
        openTextId = ev.messageId;
        yield { type: "text-start", id: ev.messageId } as unknown as Chunk;
        break;
      }
      case "token": {
        if (ev.delta === "") break;
        const id: string = ev.messageId ?? openTextId ?? opts.fallbackTextId;
        if (openTextId === null) {
          openTextId = id;
          yield { type: "text-start", id } as unknown as Chunk;
        } else if (id !== openTextId) {
          // Lifed switched correlation id mid-stream without an
          // explicit `text_start` — close the old segment and open a
          // new one keyed on the new id.
          yield* closeOpenText();
          openTextId = id;
          yield { type: "text-start", id } as unknown as Chunk;
        }
        state.text += ev.delta;
        yield {
          type: "text-delta",
          id,
          delta: ev.delta,
        } as unknown as Chunk;
        break;
      }
      case "text_end": {
        if (openTextId === ev.messageId) {
          openTextId = null;
        }
        yield { type: "text-end", id: ev.messageId } as unknown as Chunk;
        break;
      }
      case "tool_call_pending": {
        // Flush any open text so the UI renders the tool block AFTER
        // the streamed text rather than interleaved with it.
        yield* closeOpenText();
        const callId =
          ev.call.callId.length > 0
            ? ev.call.callId
            : `call_${envelope.seq.toString(16)}`;
        const toolName =
          ev.call.toolName.length > 0 ? ev.call.toolName : "unknown_tool";
        const input = parseToolInput(ev.call.inputJson);
        if (!startedToolCalls.has(callId)) {
          startedToolCalls.add(callId);
          yield {
            type: "tool-input-start",
            toolCallId: callId,
            toolName,
          } as unknown as Chunk;
        }
        yield {
          type: "tool-input-available",
          toolCallId: callId,
          toolName,
          input,
        } as unknown as Chunk;
        state.toolCalls.push({ callId, toolName, input });
        break;
      }
      case "tool_result": {
        const callId =
          ev.result.callId.length > 0
            ? ev.result.callId
            : `call_${envelope.seq.toString(16)}`;
        const output = parseToolOutput(ev.result.outputJson);
        const matching = state.toolCalls.find((c) => c.callId === callId);
        if (matching) {
          matching.output = output;
          matching.isError = ev.result.isError;
        } else {
          // Result for a call we never saw a pending for — record so
          // the persisted message still carries it.
          state.toolCalls.push({
            callId,
            toolName: ev.result.toolName,
            input: undefined,
            output,
            isError: ev.result.isError,
          });
        }
        if (ev.result.isError) {
          yield {
            type: "tool-output-error",
            toolCallId: callId,
            errorText: stringifyError(output),
          } as unknown as Chunk;
        } else {
          yield {
            type: "tool-output-available",
            toolCallId: callId,
            output,
          } as unknown as Chunk;
        }
        break;
      }
      case "finish": {
        // Don't emit a `finish` chunk here — the route's
        // `createUIMessageStream` wrapper owns the SDK-side finish so
        // it can attach the assistant message id + metadata via
        // `messageMetadata`. We just record the reason + usage for the
        // wrapper to pick up.
        state.finishReason = ev.reason;
        if (ev.usage) state.usage = { ...ev.usage };
        yield* closeOpenText();
        break;
      }
      case "error": {
        state.error = { code: ev.code, message: ev.message };
        yield* closeOpenText();
        yield {
          type: "error",
          errorText: `${ev.code}: ${ev.message}`,
        } as unknown as Chunk;
        break;
      }
      case "warning": {
        // Non-fatal — record for telemetry, don't surface to UI. The
        // SDK has no warning chunk type and a UI-side error toast for
        // every transient lifegw warning would be noisy.
        state.warnings.push({ code: ev.code, message: ev.message });
        break;
      }
      // Telemetry-only events — drop them. The UI doesn't surface
      // these today; adding chunk shapes for them would require a
      // coordinated SDK extension.
      case "open":
      case "thinking_start":
      case "thinking_end":
      case "approval_required":
      case "fs_op":
      case "nous_score":
      case "autonomic":
      case "haima_billed":
      case "vigil_span":
      case "turn_end":
        break;
      default: {
        // Should be unreachable — exhaustiveness checker keeps us
        // honest as the canonical union evolves.
        const _exhaustive: never = ev;
        void _exhaustive;
        break;
      }
    }
  }

  // Drain — make sure no text part is left open if the stream ended
  // without a `text_end` or terminal `finish`.
  yield* closeOpenText();
}

/**
 * Best-effort parse for the JSON-encoded `inputJson` field on
 * `tool_call_pending`. Returns the parsed object on success; falls back
 * to wrapping the raw string in `{ raw: ... }` when parsing fails so
 * the UI can still render *something* and the persisted record stays
 * lossless.
 */
function parseToolInput(json: string | undefined): unknown {
  if (!json) return {};
  try {
    return JSON.parse(json);
  } catch {
    return { raw: json };
  }
}

function parseToolOutput(json: string | undefined): unknown {
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return { raw: json };
  }
}

function stringifyError(output: unknown): string {
  if (typeof output === "string") return output;
  if (output && typeof output === "object") {
    try {
      return JSON.stringify(output);
    } catch {
      return String(output);
    }
  }
  return String(output ?? "tool error");
}
