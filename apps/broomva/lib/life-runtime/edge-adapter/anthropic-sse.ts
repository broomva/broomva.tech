/**
 * `CanonicalAgentEvent` → Anthropic Messages SSE byte translator.
 *
 * Emits the EXACT byte sequence the official `@anthropic-ai/sdk` parser
 * expects (per the public Messages API docs + the spec's wire-mapping
 * table). Off-the-shelf SDK clients can point at this endpoint and the
 * stream parses byte-faithfully.
 *
 * Wire shape (Anthropic Messages API):
 *
 *   event: message_start
 *   data: { "type": "message_start", "message": { id, type, role, content,
 *                                                  model, stop_reason: null,
 *                                                  stop_sequence: null, usage } }
 *
 *   ( per content block — text or tool_use )
 *     event: content_block_start
 *     data: { "type": "content_block_start", "index": <i>,
 *             "content_block": { "type": "text" | "tool_use", … } }
 *
 *     event: content_block_delta
 *     data: { "type": "content_block_delta", "index": <i>,
 *             "delta": { "type": "text_delta" | "input_json_delta", … } }
 *     … repeats …
 *
 *     event: content_block_stop
 *     data: { "type": "content_block_stop", "index": <i> }
 *
 *   event: message_delta
 *   data: { "type": "message_delta",
 *           "delta": { "stop_reason": "end_turn", "stop_sequence": null },
 *           "usage": { input_tokens, output_tokens } }
 *
 *   event: message_stop
 *   data: { "type": "message_stop" }
 *
 * On error mid-stream:
 *
 *   event: error
 *   data: { "type": "error", "error": { "type": "api_error", "message": "…" } }
 *
 * Each frame is `event: <name>\ndata: <json>\n\n` — the standard SSE
 * format. Comment-pings can be inserted with `: ping\n\n` but we don't
 * emit any in v1 (no heartbeat needed for the typical sub-30-second
 * Messages turn).
 *
 * Spec: docs/superpowers/specs/2026-05-20-anthropic-openai-edge-endpoints.md
 *       (§"Wire shape — Anthropic Messages API")
 */

import "server-only";
import type { CanonicalAgentEvent } from "@/lib/life-runtime/agent-session/types";
import type {
  AnthropicStopReason,
  AnthropicStreamEvent,
  AnthropicUsage,
} from "./types";

/**
 * Encode one Anthropic SSE event as the canonical 3-line wire form.
 *
 * Exported for unit tests that want to assert byte-faithfulness against
 * a fixture. Production code calls `canonicalToAnthropicSse` instead.
 */
export function encodeSseEvent(event: AnthropicStreamEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

/**
 * Translate a `CanonicalAgentEvent` async iterable into an Anthropic
 * Messages SSE byte stream.
 *
 * State machine: we open at most ONE text block per stream (the first
 * TOKEN opens index 0, subsequent TOKENs append). Tool-use blocks each
 * occupy their own index, opened on TOOL_CALL_PENDING and closed when
 * a non-input-delta event lands. On FINISH we close any open block,
 * emit message_delta + message_stop. On ERROR we emit an `error` event
 * and stop.
 *
 * `modelId` is what we echo back in the `message_start.message.model`
 * field — should be the caller's original `model` request param so the
 * SDK sees the id it asked for.
 *
 * `requestId` is the `msg_*` id we emit in `message_start.message.id`.
 * Callers typically use a freshly-generated UUID; collisions across
 * sessions are not load-bearing for Anthropic SDK correctness.
 */
export function canonicalToAnthropicSse(
  events: AsyncIterable<CanonicalAgentEvent>,
  modelId: string,
  requestId: string,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const enqueue = (event: AnthropicStreamEvent) => {
        controller.enqueue(encoder.encode(encodeSseEvent(event)));
      };

      // 1. message_start — always first, full envelope shape.
      const usage: AnthropicUsage = { input_tokens: 0, output_tokens: 0 };
      enqueue({
        type: "message_start",
        message: {
          id: requestId,
          type: "message",
          role: "assistant",
          content: [],
          model: modelId,
          stop_reason: null,
          stop_sequence: null,
          usage: { ...usage },
        },
      });

      // 2. Stream body — tokens, tool calls, finish, errors.
      const state: BlockState = {
        textIndex: null,
        toolBlocks: new Map<string, { index: number }>(),
        nextIndex: 0,
      };
      let stopReason: AnthropicStopReason = "end_turn";
      let errored = false;
      let finalUsage: AnthropicUsage = { ...usage };

      try {
        for await (const evt of events) {
          const result = handleEvent(evt, state, enqueue);
          if (result.errored) {
            errored = true;
            break;
          }
          if (result.finishReason) {
            stopReason = result.finishReason;
          }
          if (result.usage) {
            finalUsage = result.usage;
          }
          if (result.terminal) {
            break;
          }
        }
      } catch (err) {
        // Iterator threw — surface as a terminal error event so the SDK
        // sees a structured failure instead of a stream hang.
        const message = err instanceof Error ? err.message : String(err);
        enqueue({
          type: "error",
          error: { type: "api_error", message },
        });
        controller.close();
        return;
      }

      // 3. Close any still-open content blocks (defensive — should have
      //    been closed by handleEvent on FINISH/ERROR transitions).
      closeOpenBlocks(state, enqueue);

      if (errored) {
        // The error event itself was already emitted by handleEvent;
        // do NOT emit message_delta/message_stop in that case — the
        // Anthropic SDK treats `event: error` as terminal.
        controller.close();
        return;
      }

      // 4. message_delta + message_stop — terminal pair.
      enqueue({
        type: "message_delta",
        delta: { stop_reason: stopReason, stop_sequence: null },
        usage: finalUsage,
      });
      enqueue({ type: "message_stop" });
      controller.close();
    },
  });
}

// ---------------------------------------------------------------------------
// Implementation detail
// ---------------------------------------------------------------------------

interface BlockState {
  /**
   * The currently-open text block's index, or `null` if no text block
   * is open. Anthropic streams typically use a SINGLE text block per
   * message (index 0), reopened only after a tool_use round-trip.
   */
  textIndex: number | null;
  /**
   * Map of tool-call id → assigned index. Tool blocks each get their
   * own index, opened on TOOL_CALL_PENDING and tracked here so subsequent
   * `input_json_delta` frames go to the right index.
   */
  toolBlocks: Map<string, { index: number }>;
  /** Monotonic index counter. */
  nextIndex: number;
}

interface HandleResult {
  /** When set, finalises `stop_reason` for the terminal message_delta. */
  finishReason?: AnthropicStopReason;
  /** When set, finalises `usage` for the terminal message_delta. */
  usage?: AnthropicUsage;
  /** When true, an error event was emitted; skip the terminal pair. */
  errored?: boolean;
  /** When true, stop iterating (FINISH lands here). */
  terminal?: boolean;
}

function handleEvent(
  envelope: CanonicalAgentEvent,
  state: BlockState,
  enqueue: (e: AnthropicStreamEvent) => void,
): HandleResult {
  const ev = envelope.event;

  switch (ev.kind) {
    case "token": {
      const delta = ev.delta;
      if (!delta) return {};
      // Lazily open the text block on first token.
      if (state.textIndex === null) {
        // If a tool block is currently open, close it before opening
        // text — Anthropic's content_block model is sequential.
        closeOpenTools(state, enqueue);
        const idx = state.nextIndex++;
        state.textIndex = idx;
        enqueue({
          type: "content_block_start",
          index: idx,
          content_block: { type: "text", text: "" },
        });
      }
      enqueue({
        type: "content_block_delta",
        index: state.textIndex,
        delta: { type: "text_delta", text: delta },
      });
      return {};
    }

    case "tool_call_pending": {
      const call = ev.call;
      const callId = call.callId || synthCallId();
      const name = call.toolName || "unknown_tool";
      // Closing the text block before opening a tool block keeps the
      // Anthropic SDK's content array linear (text — tool_use — text…).
      if (state.textIndex !== null) {
        enqueue({ type: "content_block_stop", index: state.textIndex });
        state.textIndex = null;
      }
      const idx = state.nextIndex++;
      state.toolBlocks.set(callId, { index: idx });
      // tool_use blocks start with an empty `input` object; the schema
      // populates via input_json_delta frames that the SDK reassembles.
      enqueue({
        type: "content_block_start",
        index: idx,
        content_block: {
          type: "tool_use",
          id: callId,
          name,
          input: {},
        },
      });
      // If lifed already gave us the full input as JSON, stream it as
      // a single input_json_delta. The SDK reassembles correctly either
      // way — partial or whole.
      if (call.inputJson && call.inputJson !== "{}") {
        enqueue({
          type: "content_block_delta",
          index: idx,
          delta: { type: "input_json_delta", partial_json: call.inputJson },
        });
      }
      // Close immediately — lifed currently emits TOOL_CALL_PENDING as
      // a single complete event; no incremental input streaming. If
      // that changes in a future spec, this site adds a stateful
      // accumulator.
      enqueue({ type: "content_block_stop", index: idx });
      state.toolBlocks.delete(callId);
      // A tool-use call implies the assistant's turn ends here pending
      // a tool_result — `stop_reason: tool_use` is the Anthropic
      // convention for that.
      return { finishReason: "tool_use" };
    }

    case "finish": {
      // Close any still-open blocks before we emit the terminal pair.
      closeOpenBlocks(state, enqueue);
      const usage = ev.usage;
      return {
        finishReason: mapFinishReason(ev.reason),
        usage: usage
          ? {
              input_tokens: usage.inputTokens ?? 0,
              output_tokens: usage.outputTokens ?? 0,
            }
          : undefined,
        terminal: true,
      };
    }

    case "error": {
      // Close anything open, then emit a terminal `error` event. We
      // do NOT also emit message_delta/message_stop — `event: error`
      // is itself the terminator on the SDK side.
      closeOpenBlocks(state, enqueue);
      enqueue({
        type: "error",
        error: {
          type: "api_error",
          message: ev.message || ev.code || "unknown error",
        },
      });
      return { errored: true, terminal: true };
    }

    // The following events are runtime telemetry that don't map onto
    // any Anthropic SSE event — drop silently. Future versions could
    // emit them as `ping` events with metadata if the SDK ever grows
    // a hook for them.
    case "text_start":
    case "text_end":
    case "thinking_start":
    case "thinking_end":
    case "tool_result":
    case "approval_required":
    case "fs_op":
    case "nous_score":
    case "autonomic":
    case "haima_billed":
    case "vigil_span":
    case "warning":
    case "turn_end":
    case "open":
      return {};
    default: {
      // Exhaustive guard — `ev` should be `never` here. If the canonical
      // event type grows a new variant, TS forces us to handle it.
      const _exhaustive: never = ev;
      void _exhaustive;
      return {};
    }
  }
}

function closeOpenBlocks(
  state: BlockState,
  enqueue: (e: AnthropicStreamEvent) => void,
): void {
  closeOpenTools(state, enqueue);
  if (state.textIndex !== null) {
    enqueue({ type: "content_block_stop", index: state.textIndex });
    state.textIndex = null;
  }
}

function closeOpenTools(
  state: BlockState,
  enqueue: (e: AnthropicStreamEvent) => void,
): void {
  for (const { index } of state.toolBlocks.values()) {
    enqueue({ type: "content_block_stop", index });
  }
  state.toolBlocks.clear();
}

function mapFinishReason(reason: string | undefined): AnthropicStopReason {
  switch (reason) {
    case "stop":
    case "end_turn":
      return "end_turn";
    case "max_tokens":
      return "max_tokens";
    case "stop_sequence":
      return "stop_sequence";
    case "tool_use":
      return "tool_use";
    default:
      return "end_turn";
  }
}

function synthCallId(): string {
  // tool_use ids should be globally unique; if lifed didn't supply one
  // (defensive), fall back to a synthesised id with the Anthropic-style
  // `toolu_` prefix the SDK expects.
  return `toolu_${Math.random().toString(36).slice(2, 12)}`;
}
