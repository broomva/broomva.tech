// Contract test: byte-faithful OpenAI Chat Completions SSE stream.
//
// The audit gate for PR-2 of BRO-1208. Translates a canned canonical
// event stream into OpenAI SSE bytes and asserts the output matches
// hand-written fixtures verbatim. Any deviation from the documented
// OpenAI Chat Completions wire shape breaks this test — that's the
// point.
//
// The fixtures are hand-written (not vendored from `openai`) because
// the `openai` package is not a direct dependency of the broomva.tech
// app (we use the AI-SDK abstractions, not the OpenAI SDK directly).
// Hand-writing also makes the fixture self-documenting: every byte in
// the expected output is visible in this file and the assertion is a
// single string equality.
//
// What this test locks in:
//   1. Chunk shape: `data: {...}\n\n` with NO `event:` prefix.
//   2. First chunk announces role: `delta: {role: "assistant", content: ""}`.
//   3. Content deltas: `delta: {content: "..."}`.
//   4. Tool-call envelope chunk: `{index, id, type: "function",
//       function: {name, arguments: ""}}` followed by arguments-only chunk.
//   5. Terminal chunk: `delta: {}, finish_reason: <reason>`.
//   6. `data: [DONE]\n\n` terminator.
//   7. Constant `id`, `object: "chat.completion.chunk"`, `model`, `created`
//      across every chunk.
//
// References:
//   - OpenAI Chat Completions streaming:
//     https://platform.openai.com/docs/api-reference/chat/streaming
//   - Vercel AI SDK openai-compatible provider expectations:
//     https://sdk.vercel.ai/providers/openai-compatible-providers
//
// File under test: ../../../../lib/life-runtime/edge-adapter/openai-sse.ts

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { CanonicalAgentEvent } from "@/lib/life-runtime/agent-session/types";
import { canonicalToOpenaiSse } from "@/lib/life-runtime/edge-adapter/openai-sse";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function* iterate(
  events: CanonicalAgentEvent["event"][],
): AsyncIterable<CanonicalAgentEvent> {
  let i = 0n;
  for (const ev of events) {
    yield { seq: ++i, at: "2026-05-20T00:00:00.000Z", event: ev };
  }
}

async function drain(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let out = "";
  let done = false;
  while (!done) {
    const r = await reader.read();
    done = r.done;
    if (r.value) out += decoder.decode(r.value, { stream: true });
  }
  out += decoder.decode();
  return out;
}

/**
 * Strip the variable `created` Unix timestamp from each chunk so the
 * assertion is stable across test runs. The contract test cares about
 * structure + every other field; `created` is captured at stream
 * construction time and isn't load-bearing for parser correctness.
 */
function freezeCreated(wire: string): string {
  return wire.replace(/"created":\d+/g, '"created":1700000000');
}

// ---------------------------------------------------------------------------
// Fixture 1 — token-only stream
// ---------------------------------------------------------------------------

const CANONICAL_TEXT_ONLY: CanonicalAgentEvent["event"][] = [
  { kind: "token", delta: "Hello, " },
  { kind: "token", delta: "world!" },
  {
    kind: "finish",
    reason: "stop",
    usage: { inputTokens: 10, outputTokens: 5 },
  },
];

/**
 * Expected byte-for-byte SSE output. Every chunk is `data: <json>\n\n`,
 * no `event:` prefix, no extra whitespace, terminated with `data: [DONE]\n\n`.
 *
 * Chunk order:
 *   [0] role announce: `delta: {role: "assistant", content: ""}`
 *   [1] content: `delta: {content: "Hello, "}`
 *   [2] content: `delta: {content: "world!"}`
 *   [3] terminal: `delta: {}, finish_reason: "stop"`
 *   [4] `data: [DONE]\n\n`
 */
const EXPECTED_TEXT_ONLY_WIRE =
  // [0] role announce
  'data: {"id":"chatcmpl-FIXTURE-001",' +
  '"object":"chat.completion.chunk",' +
  '"created":1700000000,' +
  '"model":"claude-sonnet-4-20250514",' +
  '"choices":[{"index":0,' +
  '"delta":{"role":"assistant","content":""},' +
  '"finish_reason":null}]}\n\n' +
  // [1] content delta — "Hello, "
  'data: {"id":"chatcmpl-FIXTURE-001",' +
  '"object":"chat.completion.chunk",' +
  '"created":1700000000,' +
  '"model":"claude-sonnet-4-20250514",' +
  '"choices":[{"index":0,' +
  '"delta":{"content":"Hello, "},' +
  '"finish_reason":null}]}\n\n' +
  // [2] content delta — "world!"
  'data: {"id":"chatcmpl-FIXTURE-001",' +
  '"object":"chat.completion.chunk",' +
  '"created":1700000000,' +
  '"model":"claude-sonnet-4-20250514",' +
  '"choices":[{"index":0,' +
  '"delta":{"content":"world!"},' +
  '"finish_reason":null}]}\n\n' +
  // [3] terminal — empty delta, finish_reason="stop"
  'data: {"id":"chatcmpl-FIXTURE-001",' +
  '"object":"chat.completion.chunk",' +
  '"created":1700000000,' +
  '"model":"claude-sonnet-4-20250514",' +
  '"choices":[{"index":0,' +
  '"delta":{},' +
  '"finish_reason":"stop"}]}\n\n' +
  // [4] sentinel
  "data: [DONE]\n\n";

// ---------------------------------------------------------------------------
// Fixture 2 — tool-use round-trip
// ---------------------------------------------------------------------------

const CANONICAL_TOOL_USE: CanonicalAgentEvent["event"][] = [
  { kind: "token", delta: "Sure — " },
  {
    kind: "tool_call_pending",
    call: {
      callId: "call_01ABCdef",
      toolName: "update_cabin_params",
      inputJson: '{"updates":{"platform.width_m":3.5}}',
      requestedCapabilities: [],
    },
  },
  { kind: "finish", reason: "tool_use" },
];

/**
 * Expected wire for the tool-use stream.
 *
 * Chunk order:
 *   [0] role announce
 *   [1] content "Sure — "
 *   [2] tool-call envelope (index 0, id, type, name, arguments="")
 *   [3] tool-call arguments-only (index 0, function.arguments=<json>)
 *   [4] terminal: `delta: {}, finish_reason: "tool_calls"`
 *   [5] `[DONE]`
 */
const EXPECTED_TOOL_USE_WIRE =
  // [0] role announce
  'data: {"id":"chatcmpl-FIXTURE-002",' +
  '"object":"chat.completion.chunk",' +
  '"created":1700000000,' +
  '"model":"claude-opus-4-20250514",' +
  '"choices":[{"index":0,' +
  '"delta":{"role":"assistant","content":""},' +
  '"finish_reason":null}]}\n\n' +
  // [1] content delta — "Sure — "
  'data: {"id":"chatcmpl-FIXTURE-002",' +
  '"object":"chat.completion.chunk",' +
  '"created":1700000000,' +
  '"model":"claude-opus-4-20250514",' +
  '"choices":[{"index":0,' +
  '"delta":{"content":"Sure — "},' +
  '"finish_reason":null}]}\n\n' +
  // [2] tool-call envelope
  'data: {"id":"chatcmpl-FIXTURE-002",' +
  '"object":"chat.completion.chunk",' +
  '"created":1700000000,' +
  '"model":"claude-opus-4-20250514",' +
  '"choices":[{"index":0,' +
  '"delta":{"tool_calls":[{"index":0,' +
  '"id":"call_01ABCdef",' +
  '"type":"function",' +
  '"function":{"name":"update_cabin_params","arguments":""}}]},' +
  '"finish_reason":null}]}\n\n' +
  // [3] tool-call arguments-only
  'data: {"id":"chatcmpl-FIXTURE-002",' +
  '"object":"chat.completion.chunk",' +
  '"created":1700000000,' +
  '"model":"claude-opus-4-20250514",' +
  '"choices":[{"index":0,' +
  '"delta":{"tool_calls":[{"index":0,' +
  '"function":{"arguments":"{\\"updates\\":{\\"platform.width_m\\":3.5}}"}}]},' +
  '"finish_reason":null}]}\n\n' +
  // [4] terminal — finish_reason "tool_calls"
  'data: {"id":"chatcmpl-FIXTURE-002",' +
  '"object":"chat.completion.chunk",' +
  '"created":1700000000,' +
  '"model":"claude-opus-4-20250514",' +
  '"choices":[{"index":0,' +
  '"delta":{},' +
  '"finish_reason":"tool_calls"}]}\n\n' +
  // [5] sentinel
  "data: [DONE]\n\n";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("contract — OpenAI Chat Completions SSE wire-byte equivalence", () => {
  it("text-only stream matches the fixture verbatim", async () => {
    const stream = canonicalToOpenaiSse(
      iterate(CANONICAL_TEXT_ONLY),
      "claude-sonnet-4-20250514",
      "chatcmpl-FIXTURE-001",
    );
    const wire = freezeCreated(await drain(stream));
    expect(wire).toBe(EXPECTED_TEXT_ONLY_WIRE);
  });

  it("tool-use stream matches the fixture verbatim", async () => {
    const stream = canonicalToOpenaiSse(
      iterate(CANONICAL_TOOL_USE),
      "claude-opus-4-20250514",
      "chatcmpl-FIXTURE-002",
    );
    const wire = freezeCreated(await drain(stream));
    expect(wire).toBe(EXPECTED_TOOL_USE_WIRE);
  });

  it("never emits an `event:` line (OpenAI shape is bare data only)", async () => {
    const stream = canonicalToOpenaiSse(
      iterate(CANONICAL_TEXT_ONLY),
      "m",
      "id",
    );
    const wire = await drain(stream);
    expect(wire).not.toMatch(/^event: /m);
  });

  it("terminates with `data: [DONE]\\n\\n` on clean finish", async () => {
    const stream = canonicalToOpenaiSse(
      iterate(CANONICAL_TEXT_ONLY),
      "m",
      "id",
    );
    const wire = await drain(stream);
    expect(wire.endsWith("data: [DONE]\n\n")).toBe(true);
  });

  it("does NOT terminate with [DONE] on error stream", async () => {
    const stream = canonicalToOpenaiSse(
      iterate([
        { kind: "token", delta: "Partial" },
        {
          kind: "error",
          code: "lifed-ws.transport_error",
          message: "socket closed",
        },
      ]),
      "m",
      "id",
    );
    const wire = await drain(stream);
    expect(wire).not.toContain("[DONE]");
    expect(wire).toContain('"error"');
  });
});
