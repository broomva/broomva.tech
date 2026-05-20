// Unit tests for the canonical → OpenAI Chat Completions SSE translator.
//
// Covers:
//   1. Wire envelope shape: `data: <json>\n\n` (NO `event:` prefix —
//      OpenAI SSE doesn't use named events).
//   2. First chunk announces role (`delta: {role:"assistant",content:""}`).
//   3. TOKEN → `delta: {content: "<text>"}` chunks.
//   4. FINISH → terminal chunk with `delta: {}, finish_reason: "<reason>"`
//      followed by `data: [DONE]\n\n`.
//   5. TOOL_CALL_PENDING → first chunk full envelope
//      (`tool_calls: [{index, id, type:"function", function:{name, arguments:""}}]`),
//      second chunk arguments-only when inputJson present.
//   6. tool_calls finish_reason normalization.
//   7. ERROR → emit `data: {"error":...}\n\n`, NO `[DONE]` terminator.
//   8. Telemetry events drop silently.
//   9. Multiple tool calls in one turn — each gets a distinct index.
//
// File under test: ../openai-sse.ts

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { CanonicalAgentEvent } from "@/lib/life-runtime/agent-session/types";
import {
  canonicalToOpenaiSse,
  encodeOpenAiChunk,
  OPENAI_DONE_SENTINEL,
  type OpenAIChatCompletionChunk,
  type OpenAIErrorChunk,
} from "../openai-sse";

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
 * Parse the wire output into a list of `data:` payloads. The OpenAI
 * SSE format is bare-`data:` chunks separated by `\n\n`. Returns the
 * decoded JSON for chunks; `[DONE]` lands as the literal string sentinel.
 */
function parseSseStream(
  wire: string,
): Array<OpenAIChatCompletionChunk | OpenAIErrorChunk | "[DONE]"> {
  const blocks = wire.split("\n\n").filter((b) => b.length > 0);
  const out: Array<OpenAIChatCompletionChunk | OpenAIErrorChunk | "[DONE]"> =
    [];
  for (const block of blocks) {
    const lines = block.split("\n");
    let dataLine = "";
    let hadEventLine = false;
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        dataLine = line.slice("data: ".length);
      } else if (line.startsWith("event: ")) {
        hadEventLine = true;
      }
    }
    // OpenAI SSE MUST NOT use `event:` lines — fail loudly if we
    // accidentally emit one.
    expect(hadEventLine).toBe(false);
    if (dataLine.length === 0) continue;
    if (dataLine === "[DONE]") {
      out.push("[DONE]");
      continue;
    }
    out.push(JSON.parse(dataLine));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Wire envelope shape
// ---------------------------------------------------------------------------

describe("encodeOpenAiChunk — wire-byte shape", () => {
  it("emits `data: <json>\\n\\n` with no `event:` prefix", () => {
    const out = encodeOpenAiChunk({
      id: "x",
      object: "chat.completion.chunk",
      created: 1700000000,
      model: "m",
      choices: [{ index: 0, delta: { content: "hi" }, finish_reason: null }],
    });
    expect(out).toBe(
      'data: {"id":"x","object":"chat.completion.chunk","created":1700000000,"model":"m","choices":[{"index":0,"delta":{"content":"hi"},"finish_reason":null}]}\n\n',
    );
    expect(out).not.toContain("event:");
  });

  it("[DONE] sentinel is the exact literal", () => {
    expect(OPENAI_DONE_SENTINEL).toBe("data: [DONE]\n\n");
  });
});

// ---------------------------------------------------------------------------
// Token-only happy path
// ---------------------------------------------------------------------------

describe("canonicalToOpenaiSse — token-only stream", () => {
  it("emits role-announcement chunk first, then content deltas, finish, [DONE]", async () => {
    const stream = canonicalToOpenaiSse(
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
      "chatcmpl-test-001",
    );
    const wire = await drain(stream);
    const items = parseSseStream(wire);

    // Expect 4 chunks + [DONE] sentinel:
    //   [0] role announce
    //   [1] "Hello, "
    //   [2] "world!"
    //   [3] terminal (finish_reason: "stop")
    //   [4] "[DONE]"
    expect(items).toHaveLength(5);
    expect(items[4]).toBe("[DONE]");

    const c0 = items[0] as OpenAIChatCompletionChunk;
    expect(c0.id).toBe("chatcmpl-test-001");
    expect(c0.object).toBe("chat.completion.chunk");
    expect(c0.model).toBe("claude-sonnet-4-20250514");
    expect(c0.choices).toHaveLength(1);
    expect(c0.choices[0].delta).toEqual({ role: "assistant", content: "" });
    expect(c0.choices[0].finish_reason).toBeNull();

    const c1 = items[1] as OpenAIChatCompletionChunk;
    expect(c1.choices[0].delta).toEqual({ content: "Hello, " });
    expect(c1.choices[0].finish_reason).toBeNull();
    // Subsequent chunks should NOT carry `role` — that lives on the
    // opener only.
    expect(c1.choices[0].delta.role).toBeUndefined();

    const c2 = items[2] as OpenAIChatCompletionChunk;
    expect(c2.choices[0].delta).toEqual({ content: "world!" });

    const c3 = items[3] as OpenAIChatCompletionChunk;
    expect(c3.choices[0].delta).toEqual({});
    expect(c3.choices[0].finish_reason).toBe("stop");
  });

  it("uses the same `id` and `model` across every chunk", async () => {
    const stream = canonicalToOpenaiSse(
      iterate([
        { kind: "token", delta: "ok" },
        { kind: "finish", reason: "stop" },
      ]),
      "claude-3.5-sonnet",
      "chatcmpl-AAAA",
    );
    const wire = await drain(stream);
    const items = parseSseStream(wire);
    const chunks = items.filter(
      (i): i is OpenAIChatCompletionChunk =>
        typeof i === "object" && "object" in i,
    );
    for (const c of chunks) {
      expect(c.id).toBe("chatcmpl-AAAA");
      expect(c.model).toBe("claude-3.5-sonnet");
    }
  });

  it("does not include `[DONE]` mid-stream", async () => {
    const stream = canonicalToOpenaiSse(
      iterate([
        { kind: "token", delta: "x" },
        { kind: "finish", reason: "stop" },
      ]),
      "m",
      "id-1",
    );
    const wire = await drain(stream);
    // [DONE] only appears once, at the very end.
    const occurrences = wire.split("data: [DONE]\n\n").length - 1;
    expect(occurrences).toBe(1);
    expect(wire.endsWith("data: [DONE]\n\n")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// finish_reason mapping
// ---------------------------------------------------------------------------

describe("canonicalToOpenaiSse — finish_reason mapping", () => {
  it("maps reason=max_tokens to finish_reason=length", async () => {
    const stream = canonicalToOpenaiSse(
      iterate([
        { kind: "token", delta: "x" },
        { kind: "finish", reason: "max_tokens" },
      ]),
      "m",
      "id",
    );
    const items = parseSseStream(await drain(stream));
    const terminal = items[items.length - 2] as OpenAIChatCompletionChunk;
    expect(terminal.choices[0].finish_reason).toBe("length");
  });

  it("maps reason=tool_use to finish_reason=tool_calls", async () => {
    const stream = canonicalToOpenaiSse(
      iterate([
        {
          kind: "tool_call_pending",
          call: {
            callId: "call_x",
            toolName: "t",
            inputJson: "{}",
            requestedCapabilities: [],
          },
        },
        { kind: "finish", reason: "tool_use" },
      ]),
      "m",
      "id",
    );
    const items = parseSseStream(await drain(stream));
    const terminal = items[items.length - 2] as OpenAIChatCompletionChunk;
    expect(terminal.choices[0].finish_reason).toBe("tool_calls");
  });

  it("normalizes stop+hadToolCall to tool_calls (assistant ended on tool call)", async () => {
    const stream = canonicalToOpenaiSse(
      iterate([
        { kind: "token", delta: "Calling: " },
        {
          kind: "tool_call_pending",
          call: {
            callId: "call_x",
            toolName: "t",
            inputJson: "{}",
            requestedCapabilities: [],
          },
        },
        { kind: "finish", reason: "stop" },
      ]),
      "m",
      "id",
    );
    const items = parseSseStream(await drain(stream));
    const terminal = items[items.length - 2] as OpenAIChatCompletionChunk;
    expect(terminal.choices[0].finish_reason).toBe("tool_calls");
  });
});

// ---------------------------------------------------------------------------
// Tool calls
// ---------------------------------------------------------------------------

describe("canonicalToOpenaiSse — tool_call_pending", () => {
  it("emits first chunk with full envelope, second chunk with arguments only", async () => {
    const stream = canonicalToOpenaiSse(
      iterate([
        {
          kind: "tool_call_pending",
          call: {
            callId: "call_abc123",
            toolName: "update_cabin_params",
            inputJson: '{"updates":{"platform.width_m":3.5}}',
            requestedCapabilities: [],
          },
        },
        { kind: "finish", reason: "tool_use" },
      ]),
      "claude-opus-4",
      "chatcmpl-tool",
    );
    const items = parseSseStream(await drain(stream));

    // Expect:
    //   [0] role announce
    //   [1] tool-call envelope (id, name, empty arguments)
    //   [2] tool-call arguments-only chunk
    //   [3] terminal (finish_reason: tool_calls)
    //   [4] "[DONE]"
    expect(items).toHaveLength(5);
    expect(items[4]).toBe("[DONE]");

    const envelope = items[1] as OpenAIChatCompletionChunk;
    expect(envelope.choices[0].delta.tool_calls).toEqual([
      {
        index: 0,
        id: "call_abc123",
        type: "function",
        function: { name: "update_cabin_params", arguments: "" },
      },
    ]);

    const args = items[2] as OpenAIChatCompletionChunk;
    expect(args.choices[0].delta.tool_calls).toEqual([
      {
        index: 0,
        function: { arguments: '{"updates":{"platform.width_m":3.5}}' },
      },
    ]);
    // Arguments-only chunks must NOT re-emit `id`, `type`, or
    // `function.name` — the SDK threads them via `index`.
    expect(args.choices[0].delta.tool_calls![0].id).toBeUndefined();
    expect(args.choices[0].delta.tool_calls![0].type).toBeUndefined();
    expect(args.choices[0].delta.tool_calls![0].function?.name).toBeUndefined();
  });

  it("skips the arguments chunk when inputJson is empty/`{}`", async () => {
    const stream = canonicalToOpenaiSse(
      iterate([
        {
          kind: "tool_call_pending",
          call: {
            callId: "call_y",
            toolName: "noop",
            inputJson: "{}",
            requestedCapabilities: [],
          },
        },
        { kind: "finish", reason: "tool_use" },
      ]),
      "m",
      "id",
    );
    const items = parseSseStream(await drain(stream));
    // Expect 4 items: announce, envelope, terminal, [DONE] — NO args chunk.
    expect(items).toHaveLength(4);
    expect(items[3]).toBe("[DONE]");
    const envelope = items[1] as OpenAIChatCompletionChunk;
    expect(envelope.choices[0].delta.tool_calls).toBeDefined();
  });

  it("assigns distinct indices to multiple tool calls in one stream", async () => {
    const stream = canonicalToOpenaiSse(
      iterate([
        {
          kind: "tool_call_pending",
          call: {
            callId: "call_a",
            toolName: "t1",
            inputJson: "{}",
            requestedCapabilities: [],
          },
        },
        {
          kind: "tool_call_pending",
          call: {
            callId: "call_b",
            toolName: "t2",
            inputJson: "{}",
            requestedCapabilities: [],
          },
        },
        { kind: "finish", reason: "tool_use" },
      ]),
      "m",
      "id",
    );
    const items = parseSseStream(await drain(stream));
    const env1 = items[1] as OpenAIChatCompletionChunk;
    const env2 = items[2] as OpenAIChatCompletionChunk;
    expect(env1.choices[0].delta.tool_calls![0].index).toBe(0);
    expect(env1.choices[0].delta.tool_calls![0].id).toBe("call_a");
    expect(env2.choices[0].delta.tool_calls![0].index).toBe(1);
    expect(env2.choices[0].delta.tool_calls![0].id).toBe("call_b");
  });

  it("synthesises a call id when lifed didn't provide one", async () => {
    const stream = canonicalToOpenaiSse(
      iterate([
        {
          kind: "tool_call_pending",
          call: {
            callId: "",
            toolName: "t",
            inputJson: "{}",
            requestedCapabilities: [],
          },
        },
        { kind: "finish", reason: "tool_use" },
      ]),
      "m",
      "id",
    );
    const items = parseSseStream(await drain(stream));
    const envelope = items[1] as OpenAIChatCompletionChunk;
    const id = envelope.choices[0].delta.tool_calls![0].id;
    expect(id).toBeDefined();
    expect(id!).toMatch(/^call_/);
  });
});

// ---------------------------------------------------------------------------
// Error path
// ---------------------------------------------------------------------------

describe("canonicalToOpenaiSse — error event", () => {
  it('emits `data: {"error": …}\\n\\n` and does NOT emit [DONE]', async () => {
    const stream = canonicalToOpenaiSse(
      iterate([
        { kind: "token", delta: "Partial " },
        {
          kind: "error",
          code: "lifed-ws.transport_error",
          message: "socket closed unexpectedly",
        },
      ]),
      "claude-3.5-sonnet",
      "chatcmpl-err",
    );
    const wire = await drain(stream);
    const items = parseSseStream(wire);

    // Expect: announce, content "Partial ", error — NO terminal chunk,
    // NO [DONE].
    expect(items).toHaveLength(3);
    expect(items).not.toContain("[DONE]");

    const err = items[2] as OpenAIErrorChunk;
    expect(err.error).toBeDefined();
    expect(err.error.message).toBe("socket closed unexpectedly");
    expect(err.error.type).toBe("api_error");
    expect(err.error.code).toBe("lifed-ws.transport_error");

    // Sanity — wire ends with error chunk, not [DONE].
    expect(wire.includes("[DONE]")).toBe(false);
  });

  it("maps lifed-ws.auth errors to authentication_error type", async () => {
    const stream = canonicalToOpenaiSse(
      iterate([
        {
          kind: "error",
          code: "lifed-ws.auth",
          message: "auth failed",
        },
      ]),
      "m",
      "id",
    );
    const items = parseSseStream(await drain(stream));
    const err = items[items.length - 1] as OpenAIErrorChunk;
    expect(err.error.type).toBe("authentication_error");
  });

  it("maps lifed-ws.transient_4002 (backpressure) to rate_limit_error", async () => {
    const stream = canonicalToOpenaiSse(
      iterate([
        {
          kind: "error",
          code: "lifed-ws.transient_4002",
          message: "backpressure",
        },
      ]),
      "m",
      "id",
    );
    const items = parseSseStream(await drain(stream));
    const err = items[items.length - 1] as OpenAIErrorChunk;
    expect(err.error.type).toBe("rate_limit_error");
  });
});

// ---------------------------------------------------------------------------
// Telemetry events drop silently
// ---------------------------------------------------------------------------

describe("canonicalToOpenaiSse — telemetry events drop", () => {
  it("does not emit chunks for warning / haima_billed / vigil_span / nous_score", async () => {
    const stream = canonicalToOpenaiSse(
      iterate([
        { kind: "warning", code: "stale", message: "minor" },
        { kind: "haima_billed", microcredits: 1000, rail: "credits" },
        { kind: "vigil_span", name: "i", durationMs: 12, status: "ok" },
        { kind: "token", delta: "ok" },
        { kind: "finish", reason: "stop" },
      ]),
      "m",
      "id",
    );
    const items = parseSseStream(await drain(stream));
    // Expect 4 items: announce, content, terminal, [DONE].
    expect(items).toHaveLength(4);
    expect(items[3]).toBe("[DONE]");
  });
});

// ---------------------------------------------------------------------------
// Empty stream
// ---------------------------------------------------------------------------

describe("canonicalToOpenaiSse — empty body", () => {
  it("emits announce → terminal → [DONE] when only finish is present", async () => {
    const stream = canonicalToOpenaiSse(
      iterate([{ kind: "finish", reason: "stop" }]),
      "m",
      "id",
    );
    const items = parseSseStream(await drain(stream));
    expect(items).toHaveLength(3);
    expect(items[2]).toBe("[DONE]");
    const c0 = items[0] as OpenAIChatCompletionChunk;
    expect(c0.choices[0].delta).toEqual({ role: "assistant", content: "" });
    const c1 = items[1] as OpenAIChatCompletionChunk;
    expect(c1.choices[0].delta).toEqual({});
    expect(c1.choices[0].finish_reason).toBe("stop");
  });
});
