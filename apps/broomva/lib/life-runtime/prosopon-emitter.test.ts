// Emitter-side regression net for the Design-3 refactor (runner yields
// AI-SDK `fullStream` parts directly; emitter branches on kind).
//
// The envelope-adapter tests cover the CLIENT side of the wire — they take
// envelopes in and assert `ReplayEvent`s out. This file covers the SERVER
// side: it feeds `RunnerYield`s into the emitter and asserts the envelope
// stream that hits the wire.
//
// Focus: the pre-refactor bug (counter-based tool correlation) and the new
// pass-through semantics. We intentionally do NOT cover every AI-SDK part
// variant — the client tests provide the round-trip guarantee via the
// adapter, so one end-to-end assertion per class of event is enough.

import { describe, expect, it, vi } from "vitest";

// `prosopon-emitter.ts` begins with `import "server-only"` which blocks it
// from loading in node-side test environments. Stub it out.
vi.mock("server-only", () => ({}));

// The `@broomva/prosopon` package ships an ESM `dist/` whose re-exports
// don't resolve cleanly under Vitest's raw Node loader (Next.js/Webpack
// handles it fine at runtime). We stub the two symbols the emitter actually
// uses — `ProsoponSession.emit` (returns an envelope shape) and
// `makeEnvelope` (unused in this test file but imported at module level).
// The stub preserves the shape the emitter produces so test assertions
// still exercise real logic.
vi.mock("@broomva/prosopon", () => {
  class ProsoponSession {
    private sessionId: string;
    private seq = 0;
    constructor(opts: { sessionId: string }) {
      this.sessionId = opts.sessionId;
    }
    emit(event: unknown) {
      this.seq += 1;
      return {
        version: 1,
        session_id: this.sessionId,
        seq: this.seq,
        ts: new Date().toISOString(),
        event,
      };
    }
  }
  return {
    ProsoponSession,
    makeEnvelope: (args: unknown) => args,
  };
});

import { ProsoponEmitter } from "./prosopon-emitter";
import type { LLMStreamPart, RunnerYield } from "./types";

function makeEmitter() {
  return new ProsoponEmitter({
    sessionId: "sess-test",
    projectSlug: "sentinel",
    displayName: "Sentinel",
    paymentMode: "credits",
    priorCostCents: 0,
  });
}

function llm(part: LLMStreamPart): RunnerYield {
  return { kind: "llm", part, at: "2026-04-24T00:00:00Z" };
}

function collect(gen: Generator<unknown>): unknown[] {
  return Array.from(gen);
}

describe("ProsoponEmitter — LLM part translation", () => {
  it("text-delta emits a stream_chunk envelope with the correct id + text", () => {
    const e = makeEmitter();
    // A `text-start` has to come first so the stream node exists.
    collect(
      e.translate(
        llm({ type: "text-start", id: "t1" } as unknown as LLMStreamPart),
      ),
    );
    const out = collect(
      e.translate(
        llm({
          type: "text-delta",
          id: "t1",
          text: "Hello ",
        } as unknown as LLMStreamPart),
      ),
    ) as Array<{
      event: { type: string; id: string; chunk: { payload: { text: string } } };
    }>;
    expect(out).toHaveLength(1);
    expect(out[0]!.event.type).toBe("stream_chunk");
    expect(out[0]!.event.id).toBe("stream-t1");
    expect(out[0]!.event.chunk.payload.text).toBe("Hello ");
  });

  it("reasoning-start + reasoning-delta + reasoning-end emits section + updates", () => {
    const e = makeEmitter();
    const reasoningStart = collect(
      e.translate(
        llm({
          type: "reasoning-start",
          id: "r1",
        } as unknown as LLMStreamPart),
      ),
    ) as Array<{
      event: { type: string; node?: { id: string; intent: { title: string } } };
    }>;
    expect(reasoningStart[0]!.event.type).toBe("node_added");
    expect(reasoningStart[0]!.event.node?.id).toBe("msg-r1");
    expect(reasoningStart[0]!.event.node?.intent.title).toBe("Reasoning");

    const reasoningDelta = collect(
      e.translate(
        llm({
          type: "reasoning-delta",
          id: "r1",
          text: "planning steps",
        } as unknown as LLMStreamPart),
      ),
    ) as Array<{
      event: { type: string; patch: { attrs: { thinking: string } } };
    }>;
    expect(reasoningDelta[0]!.event.type).toBe("node_updated");
    expect(reasoningDelta[0]!.event.patch.attrs.thinking).toBe(
      "planning steps",
    );

    const reasoningEnd = collect(
      e.translate(
        llm({
          type: "reasoning-end",
          id: "r1",
        } as unknown as LLMStreamPart),
      ),
    ) as Array<{
      event: {
        type: string;
        patch: { lifecycle: { status: { kind: string } } };
      };
    }>;
    expect(reasoningEnd[0]!.event.patch.lifecycle.status.kind).toBe("resolved");
  });

  it("tool-call + tool-result correlate via toolCallId (fixes parallel-call bug)", () => {
    // Two tool-calls interleaved with their results (reverse order) — the
    // pre-refactor counter-based correlation would attribute the wrong
    // result to the wrong call. `part.toolCallId` makes this correct.
    const e = makeEmitter();

    const callA = collect(
      e.translate(
        llm({
          type: "tool-call",
          toolCallId: "call_A",
          toolName: "note",
          input: { slug: "alpha", title: "A", body: "a" },
        } as unknown as LLMStreamPart),
      ),
    ) as Array<{ event: { node: { id: string; intent: { name: string } } } }>;
    expect(callA[0]!.event.node.id).toBe("tool-call_A");
    expect(callA[0]!.event.node.intent.name).toBe("praxis.note:alpha");

    const callB = collect(
      e.translate(
        llm({
          type: "tool-call",
          toolCallId: "call_B",
          toolName: "note",
          input: { slug: "beta", title: "B", body: "b" },
        } as unknown as LLMStreamPart),
      ),
    ) as Array<{ event: { node: { id: string; intent: { name: string } } } }>;
    expect(callB[0]!.event.node.id).toBe("tool-call_B");
    expect(callB[0]!.event.node.intent.name).toBe("praxis.note:beta");

    // Result B arrives BEFORE result A — the counter-based approach would
    // attribute this to call_A; the real `toolCallId` correctly targets B.
    const resultB = collect(
      e.translate(
        llm({
          type: "tool-result",
          toolCallId: "call_B",
          toolName: "note",
          input: { slug: "beta" },
          output: { path: "/workspace/notes/beta.md" },
        } as unknown as LLMStreamPart),
      ),
    ) as Array<{ event: { type: string; id: string } }>;
    expect(resultB[0]!.event.type).toBe("node_updated");
    expect(resultB[0]!.event.id).toBe("tool-call_B");

    const resultA = collect(
      e.translate(
        llm({
          type: "tool-result",
          toolCallId: "call_A",
          toolName: "note",
          input: { slug: "alpha" },
          output: { path: "/workspace/notes/alpha.md" },
        } as unknown as LLMStreamPart),
      ),
    ) as Array<{ event: { id: string } }>;
    expect(resultA[0]!.event.id).toBe("tool-call_A");
  });

  it("unknown LLM part types no-op (forward-compat)", () => {
    // AI SDK adds part types occasionally; our emitter must not throw on them.
    // Pick a variant we've explicitly listed as intentional no-op (start-step).
    const e = makeEmitter();
    const out = collect(
      e.translate(
        llm({
          type: "start-step",
          request: { body: "" },
          warnings: [],
        } as unknown as LLMStreamPart),
      ),
    );
    expect(out).toHaveLength(0);
  });
});

describe("ProsoponEmitter — DomainEvent translation", () => {
  it("fs_op DomainEvent emits a file_write node under workspace", () => {
    const e = makeEmitter();
    const out = collect(
      e.translate({
        kind: "domain",
        event: {
          type: "fs_op",
          payload: {
            path: "/workspace/notes/audit.md",
            op: "create",
            content: "# audit",
            title: "Audit",
            bytes: 7,
          },
          at: "2026-04-24T00:00:00Z",
        },
      }),
    ) as Array<{
      event: {
        type: string;
        parent: string;
        node: { intent: { type: string; op: string; path: string } };
      };
    }>;
    expect(out).toHaveLength(1);
    expect(out[0]!.event.type).toBe("node_added");
    expect(out[0]!.event.parent).toBe("workspace");
    expect(out[0]!.event.node.intent.type).toBe("file_write");
    expect(out[0]!.event.node.intent.op).toBe("create");
    expect(out[0]!.event.node.intent.path).toBe("/workspace/notes/audit.md");
  });

  it("done DomainEvent emits cumulative Haima + Vigil signals", () => {
    const e = makeEmitter();
    const out = collect(
      e.translate({
        kind: "domain",
        event: {
          type: "done",
          payload: {
            costCents: 5,
            inputTokens: 100,
            outputTokens: 200,
            elapsedMs: 1234,
          },
          at: "2026-04-24T00:00:00Z",
        },
      }),
    ) as Array<{ event: { type: string; topic: string } }>;
    const topics = out.map((e) => e.event.topic);
    expect(topics).toEqual([
      "haima.spend.cents",
      "haima.last_turn.cents",
      "vigil.tokens.input",
      "vigil.tokens.output",
      "vigil.duration.ms",
    ]);
  });

  it("run_started DomainEvent is a no-op (scene_reset handled by runStarted())", () => {
    const e = makeEmitter();
    const out = collect(
      e.translate({
        kind: "domain",
        event: {
          type: "run_started",
          payload: { model: "openai/gpt-5-mini", project: "sentinel" },
          at: "2026-04-24T00:00:00Z",
        },
      }),
    );
    expect(out).toHaveLength(0);
  });

  it("kernel.dispatch.started DomainEvent emits kernel.dispatch.tool signal", () => {
    const e = makeEmitter();
    const out = collect(
      e.translate({
        kind: "domain",
        event: {
          type: "kernel.dispatch.started",
          payload: {
            callId: "call_abc",
            toolName: "note",
            backend: "in-process",
          },
          at: "2026-04-24T00:00:00Z",
        },
      }),
    ) as Array<{
      event: {
        type: string;
        topic: string;
        value: { Scalar: string };
      };
    }>;
    expect(out).toHaveLength(1);
    expect(out[0]!.event.type).toBe("signal_changed");
    expect(out[0]!.event.topic).toBe("kernel.dispatch.tool");
    expect(out[0]!.event.value.Scalar).toBe("note");
  });

  it("kernel.dispatch.completed DomainEvent emits Vigil dispatch signals", () => {
    const e = makeEmitter();
    const out = collect(
      e.translate({
        kind: "domain",
        event: {
          type: "kernel.dispatch.completed",
          payload: {
            callId: "call_abc",
            toolName: "note",
            isError: false,
            usage: {
              cpuMs: 0,
              memPeakKb: 0,
              egressBytes: 0,
              durationMs: 42,
              syscallCount: 0,
              confidence: "estimated",
            },
          },
          at: "2026-04-24T00:00:00Z",
        },
      }),
    ) as Array<{ event: { type: string; topic: string } }>;
    const topics = out.map((e) => e.event.topic);
    expect(topics).toEqual([
      "vigil.dispatch.duration_ms",
      "vigil.dispatch.egress_bytes",
      "vigil.dispatch.confidence",
    ]);
  });

  it("kernel.dispatch.completed without usage emits no signals (forward-compat)", () => {
    const e = makeEmitter();
    const out = collect(
      e.translate({
        kind: "domain",
        event: {
          type: "kernel.dispatch.completed",
          payload: { callId: "c", toolName: "note", isError: false },
          at: "2026-04-24T00:00:00Z",
        },
      }),
    );
    expect(out).toHaveLength(0);
  });
});

describe("ProsoponEmitter — runStarted kernel backend signal", () => {
  it("broadcasts kernel.backend signal when kernelBackendId is set", () => {
    const e = new ProsoponEmitter({
      sessionId: "sess-test",
      projectSlug: "sentinel",
      displayName: "Sentinel",
      paymentMode: "credits",
      priorCostCents: 0,
      kernelBackendId: "in-process",
    });
    const envs = Array.from(e.runStarted()) as Array<{
      event: { type: string; topic?: string; value?: { Scalar: string } };
    }>;
    const kernelSignal = envs.find(
      (env) =>
        env.event.type === "signal_changed" &&
        env.event.topic === "kernel.backend",
    );
    expect(kernelSignal).toBeDefined();
    expect(kernelSignal?.event.value?.Scalar).toBe("in-process");
  });

  it("omits kernel.backend signal when kernelBackendId is unset (back-compat)", () => {
    const e = makeEmitter();
    const envs = Array.from(e.runStarted()) as Array<{
      event: { type: string; topic?: string };
    }>;
    const kernelSignal = envs.find(
      (env) =>
        env.event.type === "signal_changed" &&
        env.event.topic === "kernel.backend",
    );
    expect(kernelSignal).toBeUndefined();
  });
});
