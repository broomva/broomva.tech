// Unit tests for the Prosopon → ReplayEvent adapter.
//
// These lock in the shape the `useProsoponRun` hook depends on: each
// Prosopon envelope variant produces exactly the ReplayEvents the legacy
// `applyReplayEvent` reducer expects. When the server-side emitter
// (`lib/life-runtime/prosopon-emitter.ts`) changes its wire format, this
// file is where the round-trip contract breaks first.

import { describe, expect, it } from "vitest";
import type { Envelope } from "@broomva/prosopon";

import { EnvelopeAdapter, TOPICS } from "./envelope-adapter";

function env(event: unknown, seq = 1): Envelope {
  return {
    version: 1,
    session_id: "sess-test",
    seq,
    ts: new Date("2026-04-23T12:00:00Z").toISOString(),
    event: event as Envelope["event"],
  };
}

describe("EnvelopeAdapter", () => {
  it("scene_reset signals a reset with no replay events", () => {
    const a = new EnvelopeAdapter();
    const out = a.feed(
      env({
        type: "scene_reset",
        scene: {
          id: "s",
          root: {
            id: "root",
            intent: { type: "section", title: "X" },
            children: [],
            bindings: [],
            actions: [],
            attrs: {},
            lifecycle: { created_at: new Date().toISOString() },
          },
          signals: {},
          hints: {},
        },
      }),
      0,
    );
    expect(out.reset).toBe(true);
    expect(out.replay).toHaveLength(0);
  });

  it("reasoning Section (msg-<id>) → agent-thinking-start", () => {
    const a = new EnvelopeAdapter();
    const out = a.feed(
      env({
        type: "node_added",
        parent: "chat",
        node: {
          id: "msg-abc",
          intent: { type: "section", title: "Reasoning", collapsible: true },
          children: [],
          bindings: [],
          actions: [],
          attrs: {},
          lifecycle: { created_at: new Date().toISOString() },
        },
      }),
      100,
    );
    expect(out.replay).toEqual([
      { t: 100, kind: "agent-thinking-start", id: "abc" },
    ]);
  });

  it("node_updated on msg-<id> with lifecycle resolved → agent-thinking-end", () => {
    const a = new EnvelopeAdapter();
    const out = a.feed(
      env({
        type: "node_updated",
        id: "msg-xyz",
        patch: {
          lifecycle: {
            created_at: new Date().toISOString(),
            status: { kind: "resolved" },
          },
        },
      }),
      200,
    );
    expect(out.replay).toContainEqual({
      t: 200,
      kind: "agent-thinking-end",
      id: "xyz",
    });
  });

  it("stream node + stream_chunk → agent-text-start + agent-text-append", () => {
    const a = new EnvelopeAdapter();
    const startOut = a.feed(
      env({
        type: "node_added",
        parent: "chat",
        node: {
          id: "stream-m1",
          intent: { type: "stream", id: "stream-m1", kind: "text" },
          children: [],
          bindings: [],
          actions: [],
          attrs: {},
          lifecycle: { created_at: new Date().toISOString() },
        },
      }),
      10,
    );
    expect(startOut.replay).toEqual([
      { t: 10, kind: "agent-text-start", id: "m1", text: "" },
    ]);

    const chunkOut = a.feed(
      env({
        type: "stream_chunk",
        id: "stream-m1",
        chunk: {
          seq: 1,
          payload: { encoding: "text", text: "Hello" },
          final_: false,
        },
      }),
      20,
    );
    expect(chunkOut.replay).toEqual([
      { t: 20, kind: "agent-text-append", id: "m1", text: "Hello" },
    ]);
  });

  it("tool_call node → tool-call event, tool_result patch → tool-result event", () => {
    const a = new EnvelopeAdapter();
    const callOut = a.feed(
      env({
        type: "node_added",
        parent: "chat",
        node: {
          id: "tool-call-1",
          intent: {
            type: "tool_call",
            name: "fs.read:/path/x.md",
            args: { path: "/path/x.md" },
          },
          children: [],
          bindings: [],
          actions: [],
          attrs: {},
          lifecycle: { created_at: new Date().toISOString() },
        },
      }),
      50,
    );
    expect(callOut.replay[0]).toMatchObject({
      t: 50,
      kind: "tool-call",
      id: "call-1",
      name: "fs.read",
      target: "/path/x.md",
      journalKind: "fs",
    });

    const resultOut = a.feed(
      env({
        type: "node_updated",
        id: "tool-call-1",
        patch: {
          intent: {
            type: "tool_result",
            success: true,
            payload: { text: "file contents" },
          },
          lifecycle: {
            created_at: new Date().toISOString(),
            status: { kind: "resolved" },
          },
        },
      }),
      80,
    );
    expect(resultOut.replay).toEqual([
      { t: 80, kind: "tool-result", id: "call-1", result: "file contents" },
    ]);
  });

  it("Custom{kind:fs.op} node → fs-op event with content/path/bytes", () => {
    const a = new EnvelopeAdapter();
    const out = a.feed(
      env({
        type: "node_added",
        parent: "workspace",
        node: {
          id: "fs-1",
          intent: {
            type: "custom",
            kind: "fs.op",
            payload: {
              path: "notes/hello.md",
              op: "write",
              content: "# hi",
              title: "greeting",
              bytes: 4,
            },
          },
          children: [],
          bindings: [],
          actions: [],
          attrs: {},
          lifecycle: { created_at: new Date().toISOString() },
        },
      }),
      120,
    );
    expect(out.replay).toEqual([
      {
        t: 120,
        kind: "fs-op",
        path: "notes/hello.md",
        op: "write",
        content: "# hi",
        title: "greeting",
        bytes: 4,
      },
    ]);
  });

  it("nous.composite + nous.band + nous.note collapse into one nous-score", () => {
    const a = new EnvelopeAdapter();
    const comp = a.feed(
      env({
        type: "signal_changed",
        topic: TOPICS.NOUS_COMPOSITE,
        value: { Scalar: 0.82 },
        ts: new Date().toISOString(),
      }),
      10,
    );
    // Composite alone: not yet emittable because band is missing.
    expect(comp.replay).toHaveLength(0);

    const band = a.feed(
      env({
        type: "signal_changed",
        topic: TOPICS.NOUS_BAND,
        value: { Scalar: "good" },
        ts: new Date().toISOString(),
      }),
      11,
    );
    expect(band.replay).toEqual([
      { t: 11, kind: "nous-score", score: 0.82, band: "good", note: "" },
    ]);

    // Note arrives later — re-emit with updated note.
    const note = a.feed(
      env({
        type: "signal_changed",
        topic: TOPICS.NOUS_NOTE,
        value: { Scalar: "context broadly anchored" },
        ts: new Date().toISOString(),
      }),
      12,
    );
    expect(note.replay).toEqual([
      {
        t: 12,
        kind: "nous-score",
        score: 0.82,
        band: "good",
        note: "context broadly anchored",
      },
    ]);
  });

  it("autonomic.<pillar>.note emits once per distinct value per pillar", () => {
    const a = new EnvelopeAdapter();
    const first = a.feed(
      env({
        type: "signal_changed",
        topic: "autonomic.operational.note",
        value: { Scalar: "nominal" },
        ts: new Date().toISOString(),
      }),
      5,
    );
    expect(first.replay).toEqual([
      { t: 5, kind: "autonomic-event", pillar: "operational", text: "nominal" },
    ]);

    // Same value again → suppressed.
    const repeat = a.feed(
      env({
        type: "signal_changed",
        topic: "autonomic.operational.note",
        value: { Scalar: "nominal" },
        ts: new Date().toISOString(),
      }),
      6,
    );
    expect(repeat.replay).toHaveLength(0);

    // Different value → emits.
    const drift = a.feed(
      env({
        type: "signal_changed",
        topic: "autonomic.operational.note",
        value: { Scalar: "drift detected" },
        ts: new Date().toISOString(),
      }),
      7,
    );
    expect(drift.replay).toEqual([
      {
        t: 7,
        kind: "autonomic-event",
        pillar: "operational",
        text: "drift detected",
      },
    ]);
  });

  it("haima/vigil signals flow to the meta channel, not replay", () => {
    const a = new EnvelopeAdapter();
    const out = a.feed(
      env({
        type: "signal_changed",
        topic: TOPICS.HAIMA_SPEND,
        value: { Scalar: 42 },
        ts: new Date().toISOString(),
      }),
      0,
    );
    expect(out.replay).toHaveLength(0);
    expect(out.meta).toEqual([{ kind: "cost-total", value: 42 }]);
  });

  it("heartbeat + action_emitted + unknown → noop", () => {
    const a = new EnvelopeAdapter();
    for (const ev of [
      { type: "heartbeat", ts: new Date().toISOString() },
      { type: "action_emitted", slot: {} },
      { type: "totally_new_future_event", whatever: 1 },
    ]) {
      const out = a.feed(env(ev), 0);
      expect(out.replay).toHaveLength(0);
      expect(out.meta).toHaveLength(0);
      expect(out.reset).toBe(false);
    }
  });
});
