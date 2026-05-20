/**
 * `CanonicalAgentEvent` → OpenAI Chat Completions SSE byte translator.
 *
 * Emits the EXACT byte sequence the official `openai` SDK + Vercel
 * AI SDK's `openai-compatible` provider expect for streaming
 * `chat.completions`. Off-the-shelf clients can point at this endpoint
 * and the stream parses byte-faithfully.
 *
 * Wire shape (OpenAI Chat Completions stream):
 *
 *   data: {"id":"<req>","object":"chat.completion.chunk","created":<unix>,
 *          "model":"<model>","choices":[{"index":0,
 *            "delta":{"role":"assistant","content":""},"finish_reason":null}]}
 *
 *   data: {…,"choices":[{"index":0,"delta":{"content":"<text>"},"finish_reason":null}]}
 *   …
 *
 *   data: {…,"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}
 *
 *   data: [DONE]
 *
 * Notes:
 *   - Every chunk is `data: <payload>\n\n` (NO `event:` prefix — OpenAI
 *     SSE does not use named events).
 *   - The first chunk announces the role (`delta: {role: "assistant",
 *     content: ""}`) — this is the convention the SDK keys off when
 *     materializing the assistant message.
 *   - The stream terminates with the literal sentinel `data: [DONE]\n\n`.
 *     The OpenAI SDK + Vercel AI SDK + `openai-compatible` provider all
 *     watch for this exact byte sequence.
 *   - On error: emit ONE `data: {"error":…}\n\n` chunk and close. Do
 *     NOT emit `[DONE]` — OpenAI's client treats `[DONE]` as a clean
 *     close, so a `[DONE]` after an error event would mask the failure.
 *   - Tool-call deltas chain: the first chunk for a tool call has full
 *     `{index, id, type:"function", function:{name, arguments:""}}`;
 *     subsequent chunks for the same tool index carry only
 *     `{index, function:{arguments:"<json-fragment>"}}` — the SDK
 *     reassembles the arguments string by concatenation.
 *
 * Spec: docs/superpowers/specs/2026-05-20-anthropic-openai-edge-endpoints.md
 *       (§"Wire shape — OpenAI Chat Completions")
 */

import "server-only";
import type { CanonicalAgentEvent } from "@/lib/life-runtime/agent-session/types";

// ---------------------------------------------------------------------------
// OpenAI chunk types — narrowed to what we emit
// ---------------------------------------------------------------------------

/**
 * Reason the assistant finished. OpenAI defines:
 *   - "stop" — natural end-of-turn (model emitted stop token)
 *   - "length" — max_tokens hit
 *   - "tool_calls" — assistant ended on a tool call (the client is
 *     expected to dispatch and reply with a `role: "tool"` message)
 *   - "content_filter" — moderation blocked output (we don't emit)
 *   - "function_call" — legacy; replaced by "tool_calls"
 */
export type OpenAIFinishReason =
  | "stop"
  | "length"
  | "tool_calls"
  | "content_filter"
  | "function_call";

export interface OpenAIToolCallDelta {
  index: number;
  id?: string;
  type?: "function";
  function?: {
    name?: string;
    arguments?: string;
  };
}

export interface OpenAIChunkDelta {
  role?: "assistant";
  content?: string | null;
  tool_calls?: OpenAIToolCallDelta[];
}

export interface OpenAIChunkChoice {
  index: number;
  delta: OpenAIChunkDelta;
  finish_reason: OpenAIFinishReason | null;
}

export interface OpenAIChatCompletionChunk {
  id: string;
  object: "chat.completion.chunk";
  created: number;
  model: string;
  choices: OpenAIChunkChoice[];
}

export interface OpenAIErrorChunk {
  error: {
    message: string;
    type: string;
    code?: string;
  };
}

// ---------------------------------------------------------------------------
// Wire encoders
// ---------------------------------------------------------------------------

/**
 * Encode one chunk payload as `data: <json>\n\n`. Exported for unit
 * tests that want byte-level fixtures.
 */
export function encodeOpenAiChunk(
  payload: OpenAIChatCompletionChunk | OpenAIErrorChunk,
): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

/** Literal `[DONE]` terminator per OpenAI Chat Completions wire spec. */
export const OPENAI_DONE_SENTINEL = "data: [DONE]\n\n";

// ---------------------------------------------------------------------------
// Main translator
// ---------------------------------------------------------------------------

/**
 * Translate a `CanonicalAgentEvent` async iterable into an OpenAI
 * Chat Completions SSE byte stream.
 *
 * State machine:
 *
 *   1. Emit the role-announcement chunk first
 *      (`delta: {role: "assistant", content: ""}`). OpenAI clients
 *      key on this to materialize the assistant message slot.
 *   2. For each TOKEN → emit `delta: {content: "<text>"}`.
 *   3. For each TOOL_CALL_PENDING → first emit a chunk with full
 *      tool-call envelope (`index, id, type:"function", function:{name,
 *      arguments:""}`); if `inputJson` is non-empty / non-`{}`, emit a
 *      follow-up chunk with `function:{arguments:"<json>"}` for the
 *      same index. Track per-call index so subsequent calls within the
 *      same turn don't collide.
 *   4. On FINISH → emit a terminal chunk with `delta: {}, finish_reason:
 *      "<reason>"`. The reason mapping favors:
 *         tool_use → "tool_calls"  (caller dispatched a tool)
 *         max_tokens → "length"
 *         anything else → "stop"
 *      Follow with `data: [DONE]\n\n`.
 *   5. On ERROR → emit one error-chunk
 *      (`data: {"error": {message, type, code}}\n\n`) and close;
 *      do NOT emit `[DONE]`.
 *
 * `modelId` echoes back in every chunk's `model` field — should be the
 * caller's original `model` request param so SDK consumers see the id
 * they asked for.
 *
 * `requestId` is a `chatcmpl_*` id used for every chunk's `id` field
 * AND surfaced as `Response.headers["openai-request-id"]` (caller's
 * concern). It MUST be stable across all chunks for one request.
 */
export function canonicalToOpenaiSse(
  events: AsyncIterable<CanonicalAgentEvent>,
  modelId: string,
  requestId: string,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const created = Math.floor(Date.now() / 1000);

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const enqueueChunk = (payload: OpenAIChatCompletionChunk) => {
        controller.enqueue(encoder.encode(encodeOpenAiChunk(payload)));
      };
      const enqueueErr = (payload: OpenAIErrorChunk) => {
        controller.enqueue(encoder.encode(encodeOpenAiChunk(payload)));
      };
      const enqueueDone = () => {
        controller.enqueue(encoder.encode(OPENAI_DONE_SENTINEL));
      };

      const makeChunk = (
        delta: OpenAIChunkDelta,
        finishReason: OpenAIFinishReason | null,
      ): OpenAIChatCompletionChunk => ({
        id: requestId,
        object: "chat.completion.chunk",
        created,
        model: modelId,
        choices: [{ index: 0, delta, finish_reason: finishReason }],
      });

      // 1. Role-announcement chunk — OpenAI's invariant: the first chunk
      //    in a stream carries `role: "assistant"`. Subsequent chunks
      //    omit `role` (the SDK keys to the role from this opener).
      enqueueChunk(makeChunk({ role: "assistant", content: "" }, null));

      // 2. Walk the canonical event stream.
      const state: OpenAiStreamState = {
        toolCalls: new Map<string, ToolCallSlot>(),
        nextToolIndex: 0,
        hadToolCall: false,
      };
      let finishReason: OpenAIFinishReason = "stop";
      let errored = false;

      try {
        for await (const envelope of events) {
          const result = handleEvent(envelope.event, state, (delta) =>
            enqueueChunk(makeChunk(delta, null)),
          );
          if (result.errored) {
            enqueueErr({
              error: {
                message: result.errorMessage ?? "unknown error",
                type: result.errorType ?? "api_error",
                code: result.errorCode,
              },
            });
            errored = true;
            break;
          }
          if (result.finishReason) {
            finishReason = result.finishReason;
          }
          if (result.terminal) {
            break;
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        enqueueErr({
          error: { message, type: "api_error" },
        });
        controller.close();
        return;
      }

      if (errored) {
        // OpenAI semantics: errored streams close WITHOUT `[DONE]`.
        controller.close();
        return;
      }

      // If the model emitted any tool call without a subsequent FINISH
      // landing on a different reason, normalize to "tool_calls" — the
      // standard OpenAI convention when the assistant ended on a tool
      // call (the client now dispatches + replies).
      if (state.hadToolCall && finishReason === "stop") {
        finishReason = "tool_calls";
      }

      // 3. Terminal chunk — empty delta, finish_reason set.
      enqueueChunk(makeChunk({}, finishReason));

      // 4. [DONE] sentinel — OpenAI clients rely on this exact literal.
      enqueueDone();
      controller.close();
    },
  });
}

// ---------------------------------------------------------------------------
// Implementation detail
// ---------------------------------------------------------------------------

interface ToolCallSlot {
  /** OpenAI tool-call index (slot within `delta.tool_calls[]`). */
  index: number;
}

interface OpenAiStreamState {
  /** Per-callId → assigned tool-call index. */
  toolCalls: Map<string, ToolCallSlot>;
  /** Monotonic OpenAI tool-call index counter. */
  nextToolIndex: number;
  /** Sticky flag — if any tool call landed in this stream. */
  hadToolCall: boolean;
}

interface HandleResult {
  finishReason?: OpenAIFinishReason;
  errored?: boolean;
  errorMessage?: string;
  errorType?: string;
  errorCode?: string;
  terminal?: boolean;
}

function handleEvent(
  ev: CanonicalAgentEvent["event"],
  state: OpenAiStreamState,
  enqueueDelta: (delta: OpenAIChunkDelta) => void,
): HandleResult {
  switch (ev.kind) {
    case "token": {
      const text = ev.delta;
      if (!text) return {};
      // Plain content chunk — no role, no tool_calls.
      enqueueDelta({ content: text });
      return {};
    }

    case "tool_call_pending": {
      const call = ev.call;
      const callId = call.callId || synthCallId();
      const name = call.toolName || "unknown_tool";
      const slot: ToolCallSlot = {
        index: state.nextToolIndex++,
      };
      state.toolCalls.set(callId, slot);
      state.hadToolCall = true;
      // First chunk for this tool call carries the full envelope —
      // id, type, function.name — and the SDK initialises the
      // tool-call slot in `delta.tool_calls[index]`.
      enqueueDelta({
        tool_calls: [
          {
            index: slot.index,
            id: callId,
            type: "function",
            function: {
              name,
              // Arguments start empty even when the full JSON is known;
              // the second chunk carries the payload as a string. The
              // OpenAI client reassembles via concat, so this works
              // regardless of whether we emit partial or whole.
              arguments: "",
            },
          },
        ],
      });
      // If lifed already gave us the full input JSON, emit a follow-up
      // chunk with the arguments payload. If it's empty / `{}`, skip —
      // the SDK accepts a tool call with empty arguments.
      if (call.inputJson && call.inputJson !== "{}") {
        enqueueDelta({
          tool_calls: [
            {
              index: slot.index,
              function: { arguments: call.inputJson },
            },
          ],
        });
      }
      // tool_use is OpenAI's convention to end the assistant turn —
      // FINISH will land on `finish_reason: "tool_calls"`.
      return {};
    }

    case "finish": {
      return {
        finishReason: mapFinishReason(ev.reason, state.hadToolCall),
        terminal: true,
      };
    }

    case "error": {
      const code = ev.code || "";
      return {
        errored: true,
        errorMessage: ev.message || code || "unknown error",
        errorType: classifyErrorType(code),
        errorCode: code || undefined,
        terminal: true,
      };
    }

    // Telemetry / non-content events — drop silently on the OpenAI
    // wire (OpenAI has no analogue for thinking, vigil_span, etc.).
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
      const _exhaustive: never = ev;
      void _exhaustive;
      return {};
    }
  }
}

function mapFinishReason(
  reason: string | undefined,
  hadToolCall: boolean,
): OpenAIFinishReason {
  switch (reason) {
    case "stop":
    case "end_turn":
      return hadToolCall ? "tool_calls" : "stop";
    case "max_tokens":
      return "length";
    case "tool_use":
      return "tool_calls";
    default:
      return hadToolCall ? "tool_calls" : "stop";
  }
}

/**
 * Map a lifed error code prefix to an OpenAI-shape error type. The
 * type strings mirror OpenAI's documented error envelope —
 * `invalid_request_error`, `authentication_error`, `rate_limit_error`,
 * `api_error`, etc.
 */
function classifyErrorType(code: string): string {
  if (code.startsWith("lifed-ws.auth")) return "authentication_error";
  if (code.startsWith("lifed-ws.ip_blocked")) return "permission_error";
  if (code.startsWith("lifed-ws.transient_4002")) return "rate_limit_error";
  if (code.startsWith("lifed-ws.aborted")) return "api_error";
  return "api_error";
}

function synthCallId(): string {
  return `call_${Math.random().toString(36).slice(2, 12)}`;
}
