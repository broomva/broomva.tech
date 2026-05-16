/**
 * Translation-helper tests for `InProcessAgentSessionClient`.
 *
 * The full `stream()` behavior is exercised via the integration
 * surface (route + canonical runtime) and the agent-browser test;
 * here we keep tests pure unit-tests of the two translation
 * functions exposed via `_internals`.
 */

import { describe, expect, it } from "vitest";

import type { DomainEvent } from "../types";
import {
  domainEventToCanonical,
  llmPartToCanonical,
} from "./event-translators";

describe("event-translators — domainEventToCanonical", () => {
  it("drops run_started (metadata-only)", () => {
    const out = domainEventToCanonical({
      type: "run_started",
      payload: {},
      at: "2026-05-03T00:00:00Z",
    });
    expect(out).toEqual([]);
  });

  it("translates fs_op create → write", () => {
    const out = domainEventToCanonical({
      type: "fs_op",
      payload: { path: "/workspace/notes/x.md", op: "create", bytes: 42 },
      at: "2026-05-03T00:00:00Z",
    });
    expect(out).toEqual([
      { kind: "fs_op", path: "/workspace/notes/x.md", op: "write", bytes: 42 },
    ]);
  });

  it("translates fs_op read", () => {
    const out = domainEventToCanonical({
      type: "fs_op",
      payload: { path: "/workspace/x.md", op: "read" },
      at: "2026-05-03T00:00:00Z",
    });
    expect(out[0]).toMatchObject({ kind: "fs_op", op: "read" });
  });

  it("falls back to /workspace/unknown when path missing", () => {
    const out = domainEventToCanonical({
      type: "fs_op",
      payload: {},
      at: "2026-05-03T00:00:00Z",
    });
    expect(out[0]).toMatchObject({ path: "/workspace/unknown" });
  });

  it("translates nous_score with rationale fallback", () => {
    const a = domainEventToCanonical({
      type: "nous_score",
      payload: { score: 0.9, note: "Clean stop" },
      at: "2026-05-03T00:00:00Z",
    });
    expect(a[0]).toEqual({
      kind: "nous_score",
      dim: "overall",
      score: 0.9,
      rationale: "Clean stop",
    });

    const b = domainEventToCanonical({
      type: "nous_score",
      payload: { score: 0.6, band: "warn" },
      at: "2026-05-03T00:00:00Z",
    });
    expect(b[0]).toMatchObject({ rationale: "warn" });
  });

  it("translates autonomic_event with valid pillar", () => {
    const out = domainEventToCanonical({
      type: "autonomic_event",
      payload: { pillar: "economic", text: "$0.0042 spent" },
      at: "2026-05-03T00:00:00Z",
    });
    expect(out[0]).toEqual({
      kind: "autonomic",
      pillar: "economic",
      note: "$0.0042 spent",
    });
  });

  it("falls back autonomic pillar when invalid", () => {
    const out = domainEventToCanonical({
      type: "autonomic_event",
      payload: { pillar: "ribosomal", text: "x" },
      at: "2026-05-03T00:00:00Z",
    });
    expect(out[0]).toMatchObject({ pillar: "operational" });
  });

  it("drops kernel.dispatch.* (already covered via tool_call/result)", () => {
    expect(
      domainEventToCanonical({
        type: "kernel.dispatch.started",
        payload: {},
        at: "2026-05-03T00:00:00Z",
      }),
    ).toEqual([]);
    expect(
      domainEventToCanonical({
        type: "kernel.dispatch.completed",
        payload: {},
        at: "2026-05-03T00:00:00Z",
      }),
    ).toEqual([]);
  });

  it("translates done into finish + usage", () => {
    const out = domainEventToCanonical({
      type: "done",
      payload: {
        costCents: 7,
        inputTokens: 200,
        outputTokens: 80,
        finishReason: "stop",
      },
      at: "2026-05-03T00:00:00Z",
    });
    expect(out).toHaveLength(1);
    const ev = out[0]!;
    expect(ev.kind).toBe("finish");
    if (ev.kind !== "finish") throw new Error("type narrowing failed");
    expect(ev.reason).toBe("stop");
    expect(ev.usage).toEqual({
      inputTokens: 200,
      outputTokens: 80,
      costCents: 7,
    });
  });

  it("translates error event into typed error", () => {
    const out = domainEventToCanonical({
      type: "error",
      payload: { code: "boom", message: "oops" },
      at: "2026-05-03T00:00:00Z",
    });
    expect(out[0]).toEqual({
      kind: "error",
      code: "boom",
      message: "oops",
    });
  });

  it("returns [] for unknown DomainEvent types", () => {
    const out = domainEventToCanonical({
      type: "future_event_type" as unknown as DomainEvent["type"],
      payload: {},
      at: "2026-05-03T00:00:00Z",
    });
    expect(out).toEqual([]);
  });
});

describe("event-translators — llmPartToCanonical", () => {
  it("returns [] for non-object input", () => {
    expect(llmPartToCanonical(null)).toEqual([]);
    expect(llmPartToCanonical(undefined)).toEqual([]);
    expect(llmPartToCanonical("text")).toEqual([]);
    expect(llmPartToCanonical(42)).toEqual([]);
  });

  it("translates text-delta with `text` field", () => {
    const out = llmPartToCanonical({ type: "text-delta", text: "hello" });
    expect(out).toEqual([{ kind: "token", delta: "hello" }]);
  });

  it("translates text-delta with `delta` field (legacy)", () => {
    const out = llmPartToCanonical({ type: "text-delta", delta: "hi" });
    expect(out).toEqual([{ kind: "token", delta: "hi" }]);
  });

  it("drops empty text-delta", () => {
    const out = llmPartToCanonical({ type: "text-delta", text: "" });
    expect(out).toEqual([]);
  });

  it("translates reasoning-delta into thinking_start (paired by caller)", () => {
    const out = llmPartToCanonical({ type: "reasoning-delta" });
    expect(out).toEqual([{ kind: "thinking_start" }]);
  });

  it("translates tool-call into tool_call_pending with serialized input", () => {
    const out = llmPartToCanonical({
      type: "tool-call",
      toolCallId: "call-1",
      toolName: "note",
      input: { slug: "x", title: "T", body: "B" },
    });
    expect(out).toHaveLength(1);
    const ev = out[0]!;
    if (ev.kind !== "tool_call_pending")
      throw new Error("expected tool_call_pending");
    expect(ev.call.callId).toBe("call-1");
    expect(ev.call.toolName).toBe("note");
    expect(JSON.parse(ev.call.inputJson)).toEqual({
      slug: "x",
      title: "T",
      body: "B",
    });
  });

  it("translates tool-result into tool_result", () => {
    const out = llmPartToCanonical({
      type: "tool-result",
      toolCallId: "call-2",
      toolName: "note",
      output: { path: "/workspace/notes/x.md" },
    });
    const ev = out[0]!;
    if (ev.kind !== "tool_result") throw new Error("expected tool_result");
    expect(ev.result.callId).toBe("call-2");
    expect(ev.result.isError).toBe(false);
    expect(JSON.parse(ev.result.outputJson)).toEqual({
      path: "/workspace/notes/x.md",
    });
  });

  it("translates tool-error with isError true + error message", () => {
    const out = llmPartToCanonical({
      type: "tool-error",
      toolCallId: "call-3",
      toolName: "note",
      error: { message: "kernel dispatch threw" },
    });
    const ev = out[0]!;
    if (ev.kind !== "tool_result") throw new Error("expected tool_result");
    expect(ev.result.isError).toBe(true);
    expect(ev.result.outputJson).toContain("kernel dispatch threw");
  });

  it("returns [] for unrecognized stream-part types", () => {
    expect(llmPartToCanonical({ type: "finish" })).toEqual([]);
    expect(llmPartToCanonical({ type: "source" })).toEqual([]);
  });
});

// Health probe is verified via the lifed-ws factory test suite; the
// in-process client's health() is trivially constant-true.
