// Unit tests for the canonical → Vercel-AI-SDK chunk translator.
//
// The translator is the load-bearing piece of PR-3: it converts the
// canonical agent-event iterator that lifegw produces into the exact
// `UIMessageChunk` shape `chat-sync.tsx`'s `useChat` hook expects.
// Any drift here causes the in-app chat UI to silently lose tokens,
// tool calls, or finish events.
//
// We test against the *shape* of emitted chunks rather than the SSE
// wire format — `JsonToSseTransformStream` handles the wire framing,
// and the SDK's serialisation is exercised by AI-SDK's own test
// suite. What this file owns is the canonical-event → UIMessageChunk
// mapping.
//
// File under test: ../canonical-to-vercel-ai-sse.ts

// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type {
  AgentEvent,
  CanonicalAgentEvent,
} from "@/lib/life-runtime/agent-session/types";
import {
  canonicalToVercelAiSdkSse,
  makeConsumeState,
} from "../canonical-to-vercel-ai-sse";

// ── Helpers ────────────────────────────────────────────────────────────

function env(seq: bigint, event: AgentEvent): CanonicalAgentEvent {
  return {
    seq,
    at: new Date(0).toISOString(),
    event,
  };
}

async function* iter(
  ...events: AgentEvent[]
): AsyncIterable<CanonicalAgentEvent> {
  let s = 0n;
  for (const e of events) {
    yield env(++s, e);
  }
}

async function collect<T>(it: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const v of it) out.push(v);
  return out;
}

// ── Token streaming ────────────────────────────────────────────────────

describe("canonicalToVercelAiSdkSse — token streaming", () => {
  it("synthesises text-start when lifed emits token without text_start", async () => {
    const out = await collect(
      canonicalToVercelAiSdkSse(
        iter(
          { kind: "token", delta: "Hello" },
          { kind: "token", delta: ", world" },
          { kind: "finish", reason: "stop" },
        ),
        { fallbackTextId: "msg_abc" },
      ),
    );

    expect(out).toEqual([
      { type: "text-start", id: "msg_abc" },
      { type: "text-delta", id: "msg_abc", delta: "Hello" },
      { type: "text-delta", id: "msg_abc", delta: ", world" },
      { type: "text-end", id: "msg_abc" },
    ]);
  });

  it("honours lifed-supplied text_start / text_end ids", async () => {
    const out = await collect(
      canonicalToVercelAiSdkSse(
        iter(
          { kind: "text_start", messageId: "seg_1" },
          { kind: "token", delta: "First segment", messageId: "seg_1" },
          { kind: "text_end", messageId: "seg_1" },
          { kind: "text_start", messageId: "seg_2" },
          { kind: "token", delta: "Second segment", messageId: "seg_2" },
          { kind: "text_end", messageId: "seg_2" },
          { kind: "finish", reason: "stop" },
        ),
        { fallbackTextId: "fallback" },
      ),
    );

    expect(out).toEqual([
      { type: "text-start", id: "seg_1" },
      { type: "text-delta", id: "seg_1", delta: "First segment" },
      { type: "text-end", id: "seg_1" },
      { type: "text-start", id: "seg_2" },
      { type: "text-delta", id: "seg_2", delta: "Second segment" },
      { type: "text-end", id: "seg_2" },
    ]);
  });

  it("accumulates total text into the consume state", async () => {
    const state = makeConsumeState();
    await collect(
      canonicalToVercelAiSdkSse(
        iter(
          { kind: "token", delta: "Hello, " },
          { kind: "token", delta: "world!" },
          { kind: "finish", reason: "stop" },
        ),
        { fallbackTextId: "msg_x", state },
      ),
    );
    expect(state.text).toBe("Hello, world!");
    expect(state.finishReason).toBe("stop");
  });

  it("drops empty token deltas without opening a text segment", async () => {
    const out = await collect(
      canonicalToVercelAiSdkSse(
        iter(
          { kind: "token", delta: "" },
          { kind: "token", delta: "real" },
          { kind: "finish", reason: "stop" },
        ),
        { fallbackTextId: "msg_y" },
      ),
    );
    expect(out).toEqual([
      { type: "text-start", id: "msg_y" },
      { type: "text-delta", id: "msg_y", delta: "real" },
      { type: "text-end", id: "msg_y" },
    ]);
  });
});

// ── Tool calls ────────────────────────────────────────────────────────

describe("canonicalToVercelAiSdkSse — tool calls", () => {
  it("emits tool-input-start + tool-input-available + tool-output-available", async () => {
    const out = await collect(
      canonicalToVercelAiSdkSse(
        iter(
          { kind: "token", delta: "Searching" },
          {
            kind: "tool_call_pending",
            call: {
              callId: "tc_123",
              toolName: "webSearch",
              inputJson: JSON.stringify({ query: "cats" }),
              requestedCapabilities: [],
            },
          },
          {
            kind: "tool_result",
            result: {
              callId: "tc_123",
              toolName: "webSearch",
              outputJson: JSON.stringify({
                results: [{ url: "https://cats.io", title: "Cats" }],
              }),
              isError: false,
            },
          },
          { kind: "finish", reason: "stop" },
        ),
        { fallbackTextId: "msg_z" },
      ),
    );

    expect(out).toEqual([
      // Text segment opened lazily for the "Searching" token
      { type: "text-start", id: "msg_z" },
      { type: "text-delta", id: "msg_z", delta: "Searching" },
      // Text segment closed before the tool block
      { type: "text-end", id: "msg_z" },
      // Tool-call dance
      {
        type: "tool-input-start",
        toolCallId: "tc_123",
        toolName: "webSearch",
      },
      {
        type: "tool-input-available",
        toolCallId: "tc_123",
        toolName: "webSearch",
        input: { query: "cats" },
      },
      {
        type: "tool-output-available",
        toolCallId: "tc_123",
        output: { results: [{ url: "https://cats.io", title: "Cats" }] },
      },
    ]);
  });

  it("maps tool_result with isError=true to tool-output-error", async () => {
    const out = await collect(
      canonicalToVercelAiSdkSse(
        iter(
          {
            kind: "tool_call_pending",
            call: {
              callId: "tc_err",
              toolName: "codeExecution",
              inputJson: JSON.stringify({ code: "boom" }),
              requestedCapabilities: [],
            },
          },
          {
            kind: "tool_result",
            result: {
              callId: "tc_err",
              toolName: "codeExecution",
              outputJson: JSON.stringify({ error: "stack overflow" }),
              isError: true,
            },
          },
          { kind: "finish", reason: "stop" },
        ),
        { fallbackTextId: "msg_e" },
      ),
    );

    const errChunk = out.find(
      (c): c is Extract<typeof c, { type: "tool-output-error" }> =>
        c.type === "tool-output-error",
    );
    expect(errChunk).toBeDefined();
    expect(errChunk?.toolCallId).toBe("tc_err");
    // errorText carries the stringified output for UI display
    expect(errChunk?.errorText).toContain("stack overflow");
  });

  it("survives malformed tool input JSON by wrapping in { raw: ... }", async () => {
    const out = await collect(
      canonicalToVercelAiSdkSse(
        iter(
          {
            kind: "tool_call_pending",
            call: {
              callId: "tc_bad",
              toolName: "anyTool",
              inputJson: "not-json}}",
              requestedCapabilities: [],
            },
          },
          { kind: "finish", reason: "stop" },
        ),
        { fallbackTextId: "msg_b" },
      ),
    );
    const avail = out.find(
      (c): c is Extract<typeof c, { type: "tool-input-available" }> =>
        c.type === "tool-input-available",
    );
    expect(avail).toBeDefined();
    expect(avail?.input).toEqual({ raw: "not-json}}" });
  });

  it("synthesises stable callIds when lifed omits them", async () => {
    const out = await collect(
      canonicalToVercelAiSdkSse(
        iter(
          {
            kind: "tool_call_pending",
            call: {
              callId: "",
              toolName: "anonymousTool",
              inputJson: "{}",
              requestedCapabilities: [],
            },
          },
          { kind: "finish", reason: "stop" },
        ),
        { fallbackTextId: "msg_q" },
      ),
    );
    const start = out.find(
      (c): c is Extract<typeof c, { type: "tool-input-start" }> =>
        c.type === "tool-input-start",
    );
    expect(start).toBeDefined();
    expect(start?.toolCallId).toMatch(/^call_/);
  });

  it("records tool calls + outputs in the consume state for persistence", async () => {
    const state = makeConsumeState();
    await collect(
      canonicalToVercelAiSdkSse(
        iter(
          {
            kind: "tool_call_pending",
            call: {
              callId: "tc_persist",
              toolName: "getWeather",
              inputJson: JSON.stringify({ city: "Bogotá" }),
              requestedCapabilities: [],
            },
          },
          {
            kind: "tool_result",
            result: {
              callId: "tc_persist",
              toolName: "getWeather",
              outputJson: JSON.stringify({ temp: 18, units: "C" }),
              isError: false,
            },
          },
          { kind: "finish", reason: "tool_use" },
        ),
        { fallbackTextId: "msg_w", state },
      ),
    );
    expect(state.toolCalls).toHaveLength(1);
    expect(state.toolCalls[0]).toMatchObject({
      callId: "tc_persist",
      toolName: "getWeather",
      input: { city: "Bogotá" },
      output: { temp: 18, units: "C" },
      isError: false,
    });
    expect(state.finishReason).toBe("tool_use");
  });
});

// ── Finish, usage, error ───────────────────────────────────────────────

describe("canonicalToVercelAiSdkSse — finish + usage + error", () => {
  it("does NOT emit a finish chunk; records usage into state", async () => {
    const state = makeConsumeState();
    const out = await collect(
      canonicalToVercelAiSdkSse(
        iter(
          { kind: "token", delta: "hi" },
          {
            kind: "finish",
            reason: "stop",
            usage: { inputTokens: 10, outputTokens: 5 },
          },
        ),
        { fallbackTextId: "msg_f", state },
      ),
    );
    // No `finish` chunk — the route's createUIMessageStream wrapper
    // owns the SDK-side finish.
    expect(out.some((c) => c.type === "finish")).toBe(false);
    expect(state.usage).toEqual({ inputTokens: 10, outputTokens: 5 });
  });

  it("maps fatal error events into a UI error chunk + records on state", async () => {
    const state = makeConsumeState();
    const out = await collect(
      canonicalToVercelAiSdkSse(
        iter(
          { kind: "token", delta: "partial" },
          {
            kind: "error",
            code: "lifed-ws.transient_4002",
            message: "backpressure",
          },
          { kind: "finish", reason: "error" },
        ),
        { fallbackTextId: "msg_err", state },
      ),
    );
    const errChunk = out.find(
      (c): c is Extract<typeof c, { type: "error" }> => c.type === "error",
    );
    expect(errChunk).toBeDefined();
    expect(errChunk?.errorText).toContain("lifed-ws.transient_4002");
    expect(errChunk?.errorText).toContain("backpressure");
    expect(state.error).toEqual({
      code: "lifed-ws.transient_4002",
      message: "backpressure",
    });
  });

  it("logs warnings to state but emits no UI chunk", async () => {
    const state = makeConsumeState();
    const out = await collect(
      canonicalToVercelAiSdkSse(
        iter(
          {
            kind: "warning",
            code: "lifed-ws.unknown_kind",
            message: "future event type",
          },
          { kind: "token", delta: "real" },
          { kind: "finish", reason: "stop" },
        ),
        { fallbackTextId: "msg_warn", state },
      ),
    );
    expect(out.some((c) => c.type === "error")).toBe(false);
    expect(state.warnings).toEqual([
      { code: "lifed-ws.unknown_kind", message: "future event type" },
    ]);
  });

  it("drops telemetry events (thinking_start/end, fs_op, etc.)", async () => {
    const out = await collect(
      canonicalToVercelAiSdkSse(
        iter(
          { kind: "thinking_start" },
          { kind: "thinking_end", ms: 12 },
          { kind: "fs_op", path: "/tmp", op: "read" },
          { kind: "nous_score", dim: "groundedness", score: 0.9 },
          { kind: "haima_billed", microcredits: 100, rail: "credits" },
          { kind: "vigil_span", name: "main", durationMs: 50, status: "ok" },
          { kind: "token", delta: "answer" },
          { kind: "finish", reason: "stop" },
        ),
        { fallbackTextId: "msg_tel" },
      ),
    );
    // Only the token + bookend text-start/text-end should be visible
    expect(out).toEqual([
      { type: "text-start", id: "msg_tel" },
      { type: "text-delta", id: "msg_tel", delta: "answer" },
      { type: "text-end", id: "msg_tel" },
    ]);
  });
});
