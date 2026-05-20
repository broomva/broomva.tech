// Contract test: byte-faithful Anthropic SSE stream.
//
// The audit gate for PR-1 of BRO-1208. Translates a canned canonical
// event stream into Anthropic SSE bytes and asserts the output matches
// a hand-written fixture verbatim. Any deviation from the documented
// Anthropic Messages API wire shape breaks this test — that's the
// point.
//
// The fixture is hand-written (not vendored from `@anthropic-ai/sdk`)
// because the SDK isn't a direct dependency of the broomva.tech app
// (only `@ai-sdk/anthropic` is). Hand-writing also makes the fixture
// self-documenting: every event in the expected output is visible in
// this file and the assertion is a single string equality.
//
// What this test locks in:
//   1. Event ORDER: message_start → content_block_start → ... → message_stop.
//   2. Event NAMES: exact strings per Anthropic Messages API.
//   3. Payload SHAPE: `type` / `index` / `delta` / `usage` / `stop_reason`
//      fields with no extras and no missing keys.
//   4. Wire FORMAT: `event: <name>\ndata: <json>\n\n` (no carriage returns,
//      no leading BOM, JSON.stringify defaults).
//
// File under test: ../../../lib/life-runtime/edge-adapter/anthropic-sse.ts

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { CanonicalAgentEvent } from "@/lib/life-runtime/agent-session/types";
import { canonicalToAnthropicSse } from "@/lib/life-runtime/edge-adapter/anthropic-sse";

// ---------------------------------------------------------------------------
// Helpers (duplicated minimally from anthropic-sse.test.ts to keep the
// contract test self-contained — it must remain stable even if helpers
// elsewhere are refactored).
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

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/**
 * Canonical event stream — what a typical lifed agent run produces for a
 * 2-token, text-only response. Mirrors what the SDK would see if hitting
 * api.anthropic.com directly for "Hello, world!" output.
 */
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
 * Expected byte-for-byte SSE wire output for the canonical stream above.
 *
 * The Anthropic Messages API publishes these event shapes — see
 *   https://docs.claude.com/en/api/messages
 * for the canonical reference. The fields, types, and ordering below
 * are the documented contract; the only flex is the `id` and `model`
 * strings which we control at the call site.
 *
 * Newlines are explicit `\n` so the assertion fails legibly on any
 * extra/missing whitespace.
 */
const EXPECTED_TEXT_ONLY_WIRE =
  // 1. message_start — opens the message envelope.
  "event: message_start\n" +
  'data: {"type":"message_start",' +
  '"message":{"id":"msg_FIXTURE_001",' +
  '"type":"message",' +
  '"role":"assistant",' +
  '"content":[],' +
  '"model":"claude-sonnet-4-20250514",' +
  '"stop_reason":null,' +
  '"stop_sequence":null,' +
  '"usage":{"input_tokens":0,"output_tokens":0}}}\n\n' +
  // 2. content_block_start (text @ index 0).
  "event: content_block_start\n" +
  'data: {"type":"content_block_start",' +
  '"index":0,' +
  '"content_block":{"type":"text","text":""}}\n\n' +
  // 3. content_block_delta — first token.
  "event: content_block_delta\n" +
  'data: {"type":"content_block_delta",' +
  '"index":0,' +
  '"delta":{"type":"text_delta","text":"Hello, "}}\n\n' +
  // 4. content_block_delta — second token.
  "event: content_block_delta\n" +
  'data: {"type":"content_block_delta",' +
  '"index":0,' +
  '"delta":{"type":"text_delta","text":"world!"}}\n\n' +
  // 5. content_block_stop — close text block.
  "event: content_block_stop\n" +
  'data: {"type":"content_block_stop","index":0}\n\n' +
  // 6. message_delta — final stop_reason + usage.
  "event: message_delta\n" +
  'data: {"type":"message_delta",' +
  '"delta":{"stop_reason":"end_turn","stop_sequence":null},' +
  '"usage":{"input_tokens":10,"output_tokens":5}}\n\n' +
  // 7. message_stop — terminator.
  "event: message_stop\n" +
  'data: {"type":"message_stop"}\n\n';

/**
 * Canonical event stream for a tool-use round-trip.
 *
 * The motivating alpine-cabin use case: agent issues an `update_cabin_params`
 * tool call mid-response. The client parses the tool_use block, applies
 * the update, and (in a follow-up turn) sends a tool_result back.
 *
 * For this stream we test the tool_use emission only — the tool_result
 * round-trip lands in a future test once D3 ships.
 */
const CANONICAL_TOOL_USE: CanonicalAgentEvent["event"][] = [
  { kind: "token", delta: "Sure — " },
  {
    kind: "tool_call_pending",
    call: {
      callId: "toolu_01ABCdef",
      toolName: "update_cabin_params",
      inputJson: '{"updates":{"platform.width_m":3.5}}',
      requestedCapabilities: [],
    },
  },
  { kind: "finish", reason: "tool_use" },
];

const EXPECTED_TOOL_USE_WIRE =
  "event: message_start\n" +
  'data: {"type":"message_start",' +
  '"message":{"id":"msg_FIXTURE_002",' +
  '"type":"message",' +
  '"role":"assistant",' +
  '"content":[],' +
  '"model":"claude-opus-4-20250514",' +
  '"stop_reason":null,' +
  '"stop_sequence":null,' +
  '"usage":{"input_tokens":0,"output_tokens":0}}}\n\n' +
  // Text block opens for "Sure — ".
  "event: content_block_start\n" +
  'data: {"type":"content_block_start",' +
  '"index":0,' +
  '"content_block":{"type":"text","text":""}}\n\n' +
  "event: content_block_delta\n" +
  'data: {"type":"content_block_delta",' +
  '"index":0,' +
  '"delta":{"type":"text_delta","text":"Sure — "}}\n\n' +
  // Text block closes before tool block opens.
  "event: content_block_stop\n" +
  'data: {"type":"content_block_stop","index":0}\n\n' +
  // tool_use block @ index 1.
  "event: content_block_start\n" +
  'data: {"type":"content_block_start",' +
  '"index":1,' +
  '"content_block":{"type":"tool_use",' +
  '"id":"toolu_01ABCdef",' +
  '"name":"update_cabin_params",' +
  '"input":{}}}\n\n' +
  // input_json_delta carries the structured payload.
  "event: content_block_delta\n" +
  'data: {"type":"content_block_delta",' +
  '"index":1,' +
  '"delta":{"type":"input_json_delta",' +
  '"partial_json":"{\\"updates\\":{\\"platform.width_m\\":3.5}}"}}\n\n' +
  // Close tool_use block.
  "event: content_block_stop\n" +
  'data: {"type":"content_block_stop","index":1}\n\n' +
  // message_delta carries `stop_reason: tool_use` per Anthropic convention.
  "event: message_delta\n" +
  'data: {"type":"message_delta",' +
  '"delta":{"stop_reason":"tool_use","stop_sequence":null},' +
  '"usage":{"input_tokens":0,"output_tokens":0}}\n\n' +
  "event: message_stop\n" +
  'data: {"type":"message_stop"}\n\n';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("contract — Anthropic SSE wire-byte equivalence", () => {
  it("text-only stream matches the fixture verbatim", async () => {
    const stream = canonicalToAnthropicSse(
      iterate(CANONICAL_TEXT_ONLY),
      "claude-sonnet-4-20250514",
      "msg_FIXTURE_001",
    );
    const wire = await drain(stream);
    expect(wire).toBe(EXPECTED_TEXT_ONLY_WIRE);
  });

  it("tool-use stream matches the fixture verbatim", async () => {
    const stream = canonicalToAnthropicSse(
      iterate(CANONICAL_TOOL_USE),
      "claude-opus-4-20250514",
      "msg_FIXTURE_002",
    );
    const wire = await drain(stream);
    expect(wire).toBe(EXPECTED_TOOL_USE_WIRE);
  });
});
