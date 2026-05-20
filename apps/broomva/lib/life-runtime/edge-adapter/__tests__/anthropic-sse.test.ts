// Unit tests for the canonical → Anthropic SSE translator.
//
// Covers:
//   1. Each canonical agent_kind translates to the documented Anthropic
//      event with the correct payload shape.
//   2. The wire envelope is `event: <name>\ndata: <json>\n\n` (no extra
//      whitespace, no leading BOM).
//   3. content_block_start opens BEFORE the first delta; content_block_stop
//      closes after the last delta; message_delta + message_stop
//      terminate cleanly.
//   4. ERROR aborts the stream — no terminal message_delta is emitted.
//   5. Tool-use round-trip: content_block_start (tool_use) → optional
//      input_json_delta → content_block_stop → stop_reason: tool_use.
//
// File under test: ../anthropic-sse.ts

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { CanonicalAgentEvent } from "@/lib/life-runtime/agent-session/types";
import { canonicalToAnthropicSse, encodeSseEvent } from "../anthropic-sse";
import type { AnthropicStreamEvent } from "../types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function envelope(
  seq: bigint,
  event: CanonicalAgentEvent["event"],
): CanonicalAgentEvent {
  return { seq, at: "2026-05-20T00:00:00Z", event };
}

async function* iterate(
  events: CanonicalAgentEvent["event"][],
): AsyncIterable<CanonicalAgentEvent> {
  let i = 0n;
  for (const ev of events) {
    yield envelope(++i, ev);
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
 * Parse the wire output back into the structured event list. Each event
 * block ends with `\n\n`; events with empty `data` (impossible in our
 * encoder, but defensive) are skipped.
 */
function parseSseStream(wire: string): AnthropicStreamEvent[] {
  const blocks = wire.split("\n\n").filter((b) => b.length > 0);
  const out: AnthropicStreamEvent[] = [];
  for (const block of blocks) {
    const lines = block.split("\n");
    let dataLine = "";
    let eventLine = "";
    for (const line of lines) {
      if (line.startsWith("data: ")) dataLine = line.slice("data: ".length);
      else if (line.startsWith("event: "))
        eventLine = line.slice("event: ".length);
    }
    if (dataLine.length === 0) continue;
    const parsed = JSON.parse(dataLine) as AnthropicStreamEvent;
    // Sanity: the `event:` line MUST match the `type` field inside `data:`.
    expect(parsed.type).toBe(eventLine);
    out.push(parsed);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Tests — wire envelope shape
// ---------------------------------------------------------------------------

describe("encodeSseEvent — wire-byte shape", () => {
  it("emits `event: <name>\\ndata: <json>\\n\\n`", () => {
    const out = encodeSseEvent({ type: "message_stop" });
    expect(out).toBe('event: message_stop\ndata: {"type":"message_stop"}\n\n');
  });

  it("emits exact JSON (no pretty-print)", () => {
    const out = encodeSseEvent({
      type: "content_block_delta",
      index: 0,
      delta: { type: "text_delta", text: "Hello" },
    });
    expect(out).toContain('"index":0');
    // No newlines INSIDE the JSON; only the two terminators.
    expect(out.split("\n\n").length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Tests — happy-path streams
// ---------------------------------------------------------------------------

describe("canonicalToAnthropicSse — token-only stream", () => {
  it("emits message_start → content_block_start → deltas → content_block_stop → message_delta → message_stop", async () => {
    const stream = canonicalToAnthropicSse(
      iterate([
        { kind: "token", delta: "Hello, " },
        { kind: "token", delta: "world!" },
        {
          kind: "finish",
          reason: "stop",
          usage: { inputTokens: 10, outputTokens: 5 },
        },
      ]),
      "claude-sonnet-4-20250514",
      "msg_test123",
    );
    const wire = await drain(stream);
    const events = parseSseStream(wire);

    expect(events.map((e) => e.type)).toEqual([
      "message_start",
      "content_block_start",
      "content_block_delta",
      "content_block_delta",
      "content_block_stop",
      "message_delta",
      "message_stop",
    ]);

    // message_start envelope.
    const start = events[0] as Extract<
      AnthropicStreamEvent,
      { type: "message_start" }
    >;
    expect(start.message.id).toBe("msg_test123");
    expect(start.message.model).toBe("claude-sonnet-4-20250514");
    expect(start.message.role).toBe("assistant");
    expect(start.message.type).toBe("message");
    expect(start.message.content).toEqual([]);
    expect(start.message.stop_reason).toBeNull();
    expect(start.message.usage).toEqual({
      input_tokens: 0,
      output_tokens: 0,
    });

    // content_block_start (text, index 0).
    const cbStart = events[1] as Extract<
      AnthropicStreamEvent,
      { type: "content_block_start" }
    >;
    expect(cbStart.index).toBe(0);
    expect(cbStart.content_block).toEqual({ type: "text", text: "" });

    // Token deltas.
    const d1 = events[2] as Extract<
      AnthropicStreamEvent,
      { type: "content_block_delta" }
    >;
    expect(d1.index).toBe(0);
    expect(d1.delta).toEqual({ type: "text_delta", text: "Hello, " });
    const d2 = events[3] as Extract<
      AnthropicStreamEvent,
      { type: "content_block_delta" }
    >;
    expect(d2.delta).toEqual({ type: "text_delta", text: "world!" });

    // content_block_stop, message_delta, message_stop.
    const cbStop = events[4] as Extract<
      AnthropicStreamEvent,
      { type: "content_block_stop" }
    >;
    expect(cbStop.index).toBe(0);
    const msgDelta = events[5] as Extract<
      AnthropicStreamEvent,
      { type: "message_delta" }
    >;
    expect(msgDelta.delta.stop_reason).toBe("end_turn");
    expect(msgDelta.usage).toEqual({ input_tokens: 10, output_tokens: 5 });
    expect(events[6].type).toBe("message_stop");
  });
});

describe("canonicalToAnthropicSse — tool-call streams", () => {
  it("emits content_block_start of type tool_use, optional input_json_delta, then content_block_stop", async () => {
    const stream = canonicalToAnthropicSse(
      iterate([
        { kind: "token", delta: "Let me check." },
        {
          kind: "tool_call_pending",
          call: {
            callId: "toolu_abc123",
            toolName: "update_cabin_params",
            inputJson: '{"updates":{"platform.width_m":3.5}}',
            requestedCapabilities: [],
          },
        },
        { kind: "finish", reason: "tool_use" },
      ]),
      "claude-opus-4-20250514",
      "msg_tool_test",
    );
    const wire = await drain(stream);
    const events = parseSseStream(wire);

    expect(events.map((e) => e.type)).toEqual([
      "message_start",
      "content_block_start", // text @ 0
      "content_block_delta", // text_delta @ 0
      "content_block_stop", // close text @ 0
      "content_block_start", // tool_use @ 1
      "content_block_delta", // input_json_delta @ 1
      "content_block_stop", // close tool_use @ 1
      "message_delta",
      "message_stop",
    ]);

    // Tool_use start carries id + name + empty input.
    const toolStart = events[4] as Extract<
      AnthropicStreamEvent,
      { type: "content_block_start" }
    >;
    expect(toolStart.index).toBe(1);
    expect(toolStart.content_block).toEqual({
      type: "tool_use",
      id: "toolu_abc123",
      name: "update_cabin_params",
      input: {},
    });

    // input_json_delta carries the partial_json payload.
    const inputDelta = events[5] as Extract<
      AnthropicStreamEvent,
      { type: "content_block_delta" }
    >;
    expect(inputDelta.index).toBe(1);
    expect(inputDelta.delta).toEqual({
      type: "input_json_delta",
      partial_json: '{"updates":{"platform.width_m":3.5}}',
    });

    // message_delta.stop_reason is `tool_use`.
    const msgDelta = events[7] as Extract<
      AnthropicStreamEvent,
      { type: "message_delta" }
    >;
    expect(msgDelta.delta.stop_reason).toBe("tool_use");
  });

  it("skips the input_json_delta when inputJson is empty/`{}`", async () => {
    const stream = canonicalToAnthropicSse(
      iterate([
        {
          kind: "tool_call_pending",
          call: {
            callId: "toolu_x",
            toolName: "no_args",
            inputJson: "{}",
            requestedCapabilities: [],
          },
        },
        { kind: "finish", reason: "tool_use" },
      ]),
      "claude-sonnet-4",
      "msg_no_input",
    );
    const wire = await drain(stream);
    const events = parseSseStream(wire);
    // No input_json_delta — just start/stop for the tool block.
    const types = events.map((e) => e.type);
    expect(types).toEqual([
      "message_start",
      "content_block_start", // tool_use @ 0
      "content_block_stop",
      "message_delta",
      "message_stop",
    ]);
  });
});

// ---------------------------------------------------------------------------
// Tests — error path
// ---------------------------------------------------------------------------

describe("canonicalToAnthropicSse — error event", () => {
  it("emits `event: error` and does NOT emit message_delta/message_stop", async () => {
    const stream = canonicalToAnthropicSse(
      iterate([
        { kind: "token", delta: "Partial " },
        {
          kind: "error",
          code: "lifed-ws.transport_error",
          message: "socket closed unexpectedly",
        },
      ]),
      "claude-3.5-sonnet",
      "msg_err",
    );
    const wire = await drain(stream);
    const events = parseSseStream(wire);

    // message_start → text block start → text delta → text block stop → error.
    expect(events.map((e) => e.type)).toEqual([
      "message_start",
      "content_block_start",
      "content_block_delta",
      "content_block_stop",
      "error",
    ]);
    const errEv = events[4] as Extract<AnthropicStreamEvent, { type: "error" }>;
    expect(errEv.error.type).toBe("api_error");
    expect(errEv.error.message).toBe("socket closed unexpectedly");
  });
});

// ---------------------------------------------------------------------------
// Tests — telemetry events drop silently
// ---------------------------------------------------------------------------

describe("canonicalToAnthropicSse — telemetry events are dropped", () => {
  it("ignores warning / haima_billed / vigil_span / nous_score / etc.", async () => {
    const stream = canonicalToAnthropicSse(
      iterate([
        { kind: "warning", code: "stale", message: "minor" },
        {
          kind: "haima_billed",
          microcredits: 1000,
          rail: "credits",
        },
        { kind: "vigil_span", name: "inference", durationMs: 12, status: "ok" },
        { kind: "token", delta: "ok" },
        { kind: "finish", reason: "stop" },
      ]),
      "claude-3.5-sonnet",
      "msg_telemetry",
    );
    const wire = await drain(stream);
    const events = parseSseStream(wire);
    expect(events.map((e) => e.type)).toEqual([
      "message_start",
      "content_block_start",
      "content_block_delta",
      "content_block_stop",
      "message_delta",
      "message_stop",
    ]);
  });
});

// ---------------------------------------------------------------------------
// Tests — empty stream
// ---------------------------------------------------------------------------

describe("canonicalToAnthropicSse — empty body", () => {
  it("emits message_start → message_delta → message_stop when finish is the only event", async () => {
    const stream = canonicalToAnthropicSse(
      iterate([{ kind: "finish", reason: "stop" }]),
      "claude-3.5-sonnet",
      "msg_empty",
    );
    const wire = await drain(stream);
    const events = parseSseStream(wire);
    expect(events.map((e) => e.type)).toEqual([
      "message_start",
      "message_delta",
      "message_stop",
    ]);
  });
});
