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
import { vi } from "vitest";

vi.mock("server-only", () => ({}));

// `kernel/types` is type-only on the import path — no runtime stub
// needed. The client only carries VmHandle through opaque generics.

import type { WebSocketFactory } from "../lifed-ws-client";
import { LifedWsAgentSessionClient } from "../lifed-ws-client";
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
