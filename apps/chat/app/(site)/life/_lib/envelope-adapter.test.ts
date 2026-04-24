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

  it("Intent::FileWrite node → fs-op event (RFC-0004 typed variant)", () => {
    const a = new EnvelopeAdapter();
    const out = a.feed(
      env({
        type: "node_added",
        parent: "workspace",
        node: {
          id: "fs-1",
          intent: {
            type: "file_write",
            path: "notes/audit.md",
            op: "create",
            content: "# Audit\n\nfindings go here\n",
            title: "Audit report",
            bytes: 26,
            mime: "text/markdown",
          },
          children: [],
          bindings: [],
          actions: [],
          attrs: {},
          lifecycle: { created_at: new Date().toISOString() },
        },
      }),
      125,
    );
    expect(out.replay).toEqual([
      {
        t: 125,
        kind: "fs-op",
        path: "notes/audit.md",
        op: "create",
        content: "# Audit\n\nfindings go here\n",
        title: "Audit report",
        bytes: 26,
      },
    ]);
  });

  it("Intent::FileWrite with op=append → fs-op op=append", () => {
    const a = new EnvelopeAdapter();
    const out = a.feed(
      env({
        type: "node_added",
        parent: "workspace",
        node: {
          id: "fs-append-1",
          intent: {
            type: "file_write",
            path: "log.txt",
            op: "append",
            content: "entry\n",
            bytes: 6,
          },
          children: [],
          bindings: [],
          actions: [],
          attrs: {},
          lifecycle: { created_at: new Date().toISOString() },
        },
      }),
      130,
    );
    expect(out.replay[0]).toMatchObject({ op: "append", path: "log.txt" });
  });

  it("Intent::FileWrite with unknown op falls back to write", () => {
    const a = new EnvelopeAdapter();
    const out = a.feed(
      env({
        type: "node_added",
        parent: "workspace",
        node: {
          id: "fs-weird-1",
          intent: {
            type: "file_write",
            path: "x",
            op: "patch", // future / unknown
          },
          children: [],
          bindings: [],
          actions: [],
          attrs: {},
          lifecycle: { created_at: new Date().toISOString() },
        },
      }),
      140,
    );
    // Forward-compat: unknown op narrows to "write" so the pane still renders.
    expect(out.replay[0]).toMatchObject({ op: "write", path: "x" });
  });

  it("Intent::FileRead pending → fs-op op=read without content", () => {
    const a = new EnvelopeAdapter();
    const out = a.feed(
      env({
        type: "node_added",
        parent: "workspace",
        node: {
          id: "fs-read-1",
          intent: {
            type: "file_read",
            path: "/workspace/input.md",
          },
          children: [],
          bindings: [],
          actions: [],
          attrs: {},
          lifecycle: { created_at: new Date().toISOString() },
        },
      }),
      150,
    );
    expect(out.replay).toEqual([
      {
        t: 150,
        kind: "fs-op",
        path: "/workspace/input.md",
        op: "read",
        content: undefined,
        bytes: undefined,
      },
    ]);
  });

  it("Intent::FileRead resolved → fs-op op=read with content + bytes", () => {
    const a = new EnvelopeAdapter();
    const out = a.feed(
      env({
        type: "node_added",
        parent: "workspace",
        node: {
          id: "fs-read-2",
          intent: {
            type: "file_read",
            path: "notes/context.md",
            content: "# Context\n",
            bytes: 10,
            mime: "text/markdown",
          },
          children: [],
          bindings: [],
          actions: [],
          attrs: {},
          lifecycle: { created_at: new Date().toISOString() },
        },
      }),
      155,
    );
    expect(out.replay[0]).toMatchObject({
      op: "read",
      path: "notes/context.md",
      content: "# Context\n",
      bytes: 10,
    });
  });

  it("Custom{kind:fs.op} node → fs-op event with content/path/bytes (back-compat)", () => {
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

  /**
   * Hydration-replay parity. Locks in that feeding a historical
   * envelope sequence through the adapter + reducer reconstructs
   * the same logical state you'd see at live-stream time. This is
   * the contract the /state endpoint relies on (Phase 2 session
   * persistence, spec:
   * docs/superpowers/specs/2026-04-24-life-session-persistence.md).
   */
  it("hydration replay: feeding a full turn sequence reconstructs state", async () => {
    const { applyReplayEvent, EMPTY_REPLAY_STATE } = await import(
      "./reducer"
    );
    const adapter = new EnvelopeAdapter();
    let state = EMPTY_REPLAY_STATE;

    // Simulated turn: user message → thinking → stream → fs write → nous.
    // Each env() call is what the server persisted to LifeRunEvent.
    const sequence = [
      env({
        type: "scene_reset",
        scene: {
          id: "s",
          root: {
            id: "root",
            intent: { type: "section", title: "Sentinel" },
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
      env({
        type: "node_added",
        parent: "chat",
        node: {
          id: "msg-a1",
          intent: { type: "section", title: "Reasoning", collapsible: true },
          children: [],
          bindings: [],
          actions: [],
          attrs: {},
          lifecycle: { created_at: new Date().toISOString() },
        },
      }),
      env({
        type: "node_updated",
        id: "msg-a1",
        patch: {
          lifecycle: {
            created_at: new Date().toISOString(),
            status: { kind: "resolved" },
          },
        },
      }),
      env({
        type: "node_added",
        parent: "chat",
        node: {
          id: "stream-a1",
          intent: { type: "stream", id: "stream-a1", kind: "text" },
          children: [],
          bindings: [],
          actions: [],
          attrs: {},
          lifecycle: { created_at: new Date().toISOString() },
        },
      }),
      env({
        type: "stream_chunk",
        id: "stream-a1",
        chunk: {
          seq: 1,
          payload: { encoding: "text", text: "Checklist " },
          final_: false,
        },
      }),
      env({
        type: "stream_chunk",
        id: "stream-a1",
        chunk: {
          seq: 2,
          payload: { encoding: "text", text: "landing." },
          final_: false,
        },
      }),
      env({
        type: "node_added",
        parent: "workspace",
        node: {
          id: "fs-note-1",
          intent: {
            type: "file_write",
            path: "notes/audit.md",
            op: "create",
            content: "# Audit\n",
            title: "Audit report",
            bytes: 8,
          },
          children: [],
          bindings: [],
          actions: [],
          attrs: {},
          lifecycle: { created_at: new Date().toISOString() },
        },
      }),
      env({
        type: "signal_changed",
        topic: TOPICS.NOUS_COMPOSITE,
        value: { Scalar: 0.82 },
        ts: new Date().toISOString(),
      }),
      env({
        type: "signal_changed",
        topic: TOPICS.NOUS_BAND,
        value: { Scalar: "good" },
        ts: new Date().toISOString(),
      }),
    ];

    for (const e of sequence) {
      const out = adapter.feed(e, 0);
      if (out.reset) state = EMPTY_REPLAY_STATE;
      for (const ev of out.replay) {
        state = applyReplayEvent(state, ev);
      }
    }

    // Verify the reconstructed state matches what a live-stream user
    // would have seen after the turn completed:
    expect(state.messages.length).toBe(1);
    expect(state.messages[0]?.id).toBe("a1");
    expect(state.messages[0]?.text).toBe("Checklist landing.");
    expect(state.fsOps.length).toBe(1);
    expect(state.fsOps[0]?.path).toBe("notes/audit.md");
    expect(state.fsOps[0]?.op).toBe("create");
    expect(state.fsOps[0]?.content).toBe("# Audit\n");
    expect(state.nous).toEqual({
      score: 0.82,
      band: "good",
      note: "",
    });
  });

  /**
   * Idempotency: feeding the same envelopes twice through a fresh
   * adapter must produce identical state. Critical for hydration —
   * a page refresh during an in-flight fetch must not accumulate
   * state when the replay re-runs.
   */
  it("hydration replay: re-feeding same envelopes produces same state", async () => {
    const { applyReplayEvent, EMPTY_REPLAY_STATE } = await import(
      "./reducer"
    );

    const fold = (envelopes: Envelope[]) => {
      const adapter = new EnvelopeAdapter();
      let state = EMPTY_REPLAY_STATE;
      for (const e of envelopes) {
        const out = adapter.feed(e, 0);
        if (out.reset) state = EMPTY_REPLAY_STATE;
        for (const ev of out.replay) {
          state = applyReplayEvent(state, ev);
        }
      }
      return state;
    };

    const sequence: Envelope[] = [
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
      env({
        type: "node_added",
        parent: "workspace",
        node: {
          id: "fs-1",
          intent: {
            type: "file_write",
            path: "a.md",
            op: "create",
            content: "one",
            bytes: 3,
          },
          children: [],
          bindings: [],
          actions: [],
          attrs: {},
          lifecycle: { created_at: new Date().toISOString() },
        },
      }),
    ];

    const a = fold(sequence);
    const b = fold(sequence);
    expect(a.fsOps.length).toBe(b.fsOps.length);
    expect(a.fsOps[0]?.path).toBe(b.fsOps[0]?.path);
    expect(a.messages.length).toBe(b.messages.length);
  });
});
