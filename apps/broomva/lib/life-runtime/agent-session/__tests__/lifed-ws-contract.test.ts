/**
 * Contract tests for `LifedWsAgentSessionClient`.
 *
 * Wires the contract harness (`./contract.ts`) to a scripted fake
 * `WebSocketFactory`. The fake WS:
 *
 *   - Fires `open` asynchronously via `queueMicrotask`.
 *   - Accepts inbound `send_message` frames and emits one scripted
 *     turn's worth of `agent_event` frames (token deltas + FINISH).
 *   - Per-turn FINISH does NOT close the WS — matches lifed's actual
 *     behavior (Open Q 1 verdict).
 *   - Records observed userMessages per turn so the contract harness
 *     can assert routing.
 *
 * History is NOT observable from the client side — lifed accumulates
 * it server-side. The fake leaves `observedTurns[i].history`
 * undefined; the harness skips the history assertion for this backend
 * (see contract.ts Test #4).
 *
 * Plan E-2 Task 4.
 *
 * @see ./contract.ts
 * @see ../lifed-ws-client.ts
 */

// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// `kernel/types` is type-only on the import path — no runtime stub
// needed. The client only carries VmHandle through opaque generics.

import type { WebSocketFactory } from "../lifed-ws-client";
import { LifedWsAgentSessionClient } from "../lifed-ws-client";
import type { CanonicalAgentEvent } from "../types";
import {
  type AgentSessionScript,
  type MakeClient,
  runAgentSessionClientContract,
  type SubstrateObservations,
} from "./contract";

// ---------------------------------------------------------------------------
// FakeWebSocket — scripted bidi WS used by the LifedWs contract suite.
// ---------------------------------------------------------------------------

/** Minimal WsLike shape — must match `lifed-ws-client.ts`'s WsLike. */
interface FakeWsHandlers {
  open?: () => void;
  message?: (e: { data: unknown }) => void;
  error?: (e: { message?: string }) => void;
  close?: (e: { code: number; reason: string }) => void;
}

class FakeWebSocket {
  readyState = 0; // CONNECTING
  private handlers: FakeWsHandlers = {};
  private script: AgentSessionScript;
  private observations: SubstrateObservations;
  private turnIndex = 0;
  private seqNo = 0;

  constructor(script: AgentSessionScript, observations: SubstrateObservations) {
    this.script = script;
    this.observations = observations;
    // Fire `open` on the next microtask so the client's
    // addEventListener has time to register.
    queueMicrotask(() => {
      this.readyState = 1; // OPEN
      this.handlers.open?.();
    });
  }

  addEventListener<K extends keyof FakeWsHandlers>(
    event: K,
    h: NonNullable<FakeWsHandlers[K]>,
  ): void {
    // biome-ignore lint/suspicious/noExplicitAny: handler union
    (this.handlers as any)[event] = h;
  }

  send(data: string): void {
    // Inbound `send_message` frame — start a new turn.
    let frame: { kind: string; content?: string };
    try {
      frame = JSON.parse(data) as typeof frame;
    } catch {
      return;
    }
    if (frame.kind !== "send_message") return;
    const userMessage = frame.content ?? "";
    this.observations.observedTurns.push({
      userMessage,
      // History intentionally omitted — see file docstring.
    });

    const turn = this.script.turns[this.turnIndex];
    this.turnIndex += 1;

    if (!turn) {
      // Out-of-script — emit just a FINISH so the stream advances.
      this.scheduleFinish();
      return;
    }

    // Schedule token frames + FINISH on subsequent microtasks so the
    // client's iterator parks/wakes naturally.
    queueMicrotask(() => {
      for (const delta of turn.tokens) {
        if (this.readyState !== 1) return;
        this.seqNo += 1;
        const eventFrame = {
          kind: "agent_event",
          seq_no: String(this.seqNo),
          record: {
            sequence: this.seqNo,
            at: new Date().toISOString(),
            kind: "TOKEN",
            payload: { text: delta },
          },
          agent_kind: "AGENT_EVENT_KIND_TOKEN",
        };
        this.handlers.message?.({ data: JSON.stringify(eventFrame) });
      }
      this.scheduleFinish();
    });
  }

  private scheduleFinish(): void {
    queueMicrotask(() => {
      if (this.readyState !== 1) return;
      this.seqNo += 1;
      const finishFrame = {
        kind: "agent_event",
        seq_no: String(this.seqNo),
        record: {
          sequence: this.seqNo,
          at: new Date().toISOString(),
          kind: "FINISH",
          payload: { finish_reason: "stop" },
        },
        agent_kind: "AGENT_EVENT_KIND_FINISH",
      };
      this.handlers.message?.({ data: JSON.stringify(finishFrame) });

      // Auto-close ONLY when the script is exhausted. Per-turn tests
      // ship one-turn scripts; multi-turn tests ship 2+. The Open Q 1
      // verdict says lifed keeps the WS open across many turns, but
      // when the conversation truly concludes the WS must close so
      // the iterator can exit. Exhaustion is our model of that.
      //
      // Reads readyState after FINISH propagation — if the per-turn
      // client called cleanup() in its finally, readyState is 3 by
      // now and we no-op.
      if (this.turnIndex >= this.script.turns.length) {
        queueMicrotask(() => {
          if (this.readyState === 1) {
            this.close(1000, "script exhausted");
          }
        });
      }
    });
  }

  close(code = 1000, reason = ""): void {
    this.readyState = 3; // CLOSED
    queueMicrotask(() => {
      this.handlers.close?.({ code, reason });
    });
  }
}

// ---------------------------------------------------------------------------
// Factory wiring for the harness.
// ---------------------------------------------------------------------------

const makeLifedWsClient: MakeClient = (script: AgentSessionScript) => {
  const observations: SubstrateObservations = { observedTurns: [] };
  const webSocketFactory: WebSocketFactory = () =>
    new FakeWebSocket(
      script,
      observations,
    ) as unknown as ReturnType<WebSocketFactory>;
  const client = new LifedWsAgentSessionClient({
    baseUrl: "https://fake.lifegw.test",
    webSocketFactory,
    fetchFn: (async () => new Response("OK")) as typeof fetch,
  });
  return { client, observations };
};

runAgentSessionClientContract("LifedWsAgentSessionClient", makeLifedWsClient);

// ---------------------------------------------------------------------------
// Per-turn baseline regression tests for close-after-finish behavior.
//
// These verify the strict terminal-finish-once invariant on the
// per-turn path: when the server already sent FINISH, a subsequent
// close (normal OR error) MUST NOT double-emit a second `finish`.
// Pre-fix, the per-turn finally block paired error+finish on any
// close code even when finishYielded was already true (Codex
// reviewer's BLOCKER #5 — "transient close after finish").
// ---------------------------------------------------------------------------

/**
 * A tight, deterministic WS fake that emits exactly:
 *   - one TOKEN frame (so the iterator has something to yield)
 *   - one FINISH frame
 *   - then a close(code) — caller chooses 1000 (normal) or 1011 (transient)
 *
 * Used by the close-after-finish regression tests below. The harness's
 * `FakeWebSocket` is too message-driven for this — it auto-closes on
 * script exhaustion, which obscures the close-code timing the test
 * needs to control directly.
 */
class CloseAfterFinishFake {
  readyState = 0; // CONNECTING
  private handlers: FakeWsHandlers = {};

  constructor(private readonly closeCode: number) {
    queueMicrotask(() => {
      this.readyState = 1; // OPEN
      this.handlers.open?.();
    });
  }

  addEventListener<K extends keyof FakeWsHandlers>(
    event: K,
    h: NonNullable<FakeWsHandlers[K]>,
  ): void {
    // biome-ignore lint/suspicious/noExplicitAny: handler union
    (this.handlers as any)[event] = h;
  }

  send(_data: string): void {
    queueMicrotask(() => {
      if (this.readyState !== 1) return;
      this.handlers.message?.({
        data: JSON.stringify({
          kind: "agent_event",
          seq_no: "1",
          record: {
            sequence: 1,
            at: new Date().toISOString(),
            kind: "TOKEN",
            payload: { text: "hi" },
          },
          agent_kind: "AGENT_EVENT_KIND_TOKEN",
        }),
      });
      this.handlers.message?.({
        data: JSON.stringify({
          kind: "agent_event",
          seq_no: "2",
          record: {
            sequence: 2,
            at: new Date().toISOString(),
            kind: "FINISH",
            payload: { finish_reason: "stop" },
          },
          agent_kind: "AGENT_EVENT_KIND_FINISH",
        }),
      });
      // Fire the close on the next microtask so the FINISH frame is
      // fully processed by the client's pump loop first.
      queueMicrotask(() => {
        this.readyState = 3; // CLOSED
        this.handlers.close?.({ code: this.closeCode, reason: "" });
      });
    });
  }

  close(_code = 1000, _reason = ""): void {
    this.readyState = 3;
  }
}

async function drainStream(
  client: LifedWsAgentSessionClient,
  sid: string,
): Promise<CanonicalAgentEvent[]> {
  const events: CanonicalAgentEvent[] = [];
  const iter = client.stream({
    sessionId: sid,
    agentId: "user:close-after-finish",
    projectSlug: "sentinel-property-ops",
    history: [],
    kernelCtx: { sessionId: sid, agentId: "user:close-after-finish" },
    capability: { token: "fake", expiresAt: 9_999_999_999 },
    userMessage: "hi",
    // multiTurn omitted → per-turn path under test.
  });
  for await (const ev of iter) events.push(ev);
  return events;
}

describe("LifedWsAgentSessionClient — per-turn close-after-finish parity", () => {
  it("per-turn: server FINISH followed by normal close (1000) does NOT double-emit finish", async () => {
    const wsFactory: WebSocketFactory = () =>
      new CloseAfterFinishFake(1000) as unknown as ReturnType<WebSocketFactory>;
    const client = new LifedWsAgentSessionClient({
      baseUrl: "https://fake.lifegw.test",
      webSocketFactory: wsFactory,
      fetchFn: (async () => new Response("OK")) as typeof fetch,
    });

    const events = await drainStream(client, "close-after-finish-1000");
    // Exactly one `finish` total — the server FINISH frame produced
    // it; the normal close handler must NOT synthesize another.
    const finishes = events.filter((e) => e.event.kind === "finish");
    expect(finishes).toHaveLength(1);
    // No paired `error` event either — close 1000 is clean.
    const errors = events.filter((e) => e.event.kind === "error");
    expect(errors).toHaveLength(0);
    // `finish` is terminal-and-last.
    expect(events[events.length - 1].event.kind).toBe("finish");
  });

  it("per-turn: server FINISH followed by error close (1011) does NOT double-emit terminal events", async () => {
    const wsFactory: WebSocketFactory = () =>
      new CloseAfterFinishFake(1011) as unknown as ReturnType<WebSocketFactory>;
    const client = new LifedWsAgentSessionClient({
      baseUrl: "https://fake.lifegw.test",
      webSocketFactory: wsFactory,
      fetchFn: (async () => new Response("OK")) as typeof fetch,
    });

    const events = await drainStream(client, "close-after-finish-1011");
    // Exactly one `finish` total — the server FINISH frame already
    // produced the terminal event. A subsequent transient close
    // (1011) MUST NOT pair-emit error+finish.
    const finishes = events.filter((e) => e.event.kind === "finish");
    expect(finishes).toHaveLength(1);
    // No `error` event either — once FINISH lands, the stream is
    // contractually closed; transient transport close after that is
    // a no-op for the consumer.
    const errors = events.filter((e) => e.event.kind === "error");
    expect(errors).toHaveLength(0);
    // `finish` remains terminal-and-last.
    expect(events[events.length - 1].event.kind).toBe("finish");
  });
});

/**
 * A WS fake that emits TOKEN + FINISH and then NEVER closes the socket —
 * modelling lifed's real per-turn behaviour (the fan-out sender stays
 * attached after a single-turn FINISH, so the WS is not server-closed).
 * The harness `FakeWebSocket` auto-closes on script exhaustion, which
 * masked this; in production it caused the stream to hang ~30s after a
 * complete answer and append a spurious `frame-deadline` error.
 */
class NeverClosesAfterFinishFake {
  readyState = 0;
  private handlers: FakeWsHandlers = {};

  constructor() {
    queueMicrotask(() => {
      this.readyState = 1;
      this.handlers.open?.();
    });
  }

  addEventListener<K extends keyof FakeWsHandlers>(
    event: K,
    h: NonNullable<FakeWsHandlers[K]>,
  ): void {
    // biome-ignore lint/suspicious/noExplicitAny: handler union
    (this.handlers as any)[event] = h;
  }

  send(_data: string): void {
    queueMicrotask(() => {
      if (this.readyState !== 1) return;
      this.handlers.message?.({
        data: JSON.stringify({
          kind: "agent_event",
          seq_no: "1",
          record: { sequence: 1, at: new Date().toISOString(), kind: "TOKEN", payload: { text: "hi" } },
          agent_kind: "AGENT_EVENT_KIND_TOKEN",
        }),
      });
      this.handlers.message?.({
        data: JSON.stringify({
          kind: "agent_event",
          seq_no: "2",
          record: { sequence: 2, at: new Date().toISOString(), kind: "FINISH", payload: { finish_reason: "stop" } },
          agent_kind: "AGENT_EVENT_KIND_FINISH",
        }),
      });
      // Intentionally NO close() — the socket stays open forever.
    });
  }

  close(_code = 1000, _reason = ""): void {
    this.readyState = 3;
  }
}

describe("LifedWsAgentSessionClient — per-turn terminates on FINISH without server close", () => {
  it("completes the iterator on FINISH even when the WS never closes", async () => {
    const wsFactory: WebSocketFactory = () =>
      new NeverClosesAfterFinishFake() as unknown as ReturnType<WebSocketFactory>;
    const client = new LifedWsAgentSessionClient({
      baseUrl: "https://fake.lifegw.test",
      webSocketFactory: wsFactory,
      fetchFn: (async () => new Response("OK")) as typeof fetch,
    });

    // Without the per-turn break-on-finish fix this `for await` (inside
    // drainStream) would never resolve — the test would hang to timeout.
    const events = await drainStream(client, "never-closes-after-finish");

    expect(events.some((e) => e.event.kind === "token")).toBe(true);
    const finishes = events.filter((e) => e.event.kind === "finish");
    expect(finishes).toHaveLength(1);
    expect(events.filter((e) => e.event.kind === "error")).toHaveLength(0);
    expect(events[events.length - 1].event.kind).toBe("finish");
  });
});
