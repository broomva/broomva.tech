/**
 * Contract test harness for `AgentSessionClient` — runs the SAME
 * tests against every backend so per-backend test files only have
 * to wire the client factory.
 *
 * Plan E-2 (Task 4) + P20 round-1 parity fixes. The harness defines
 * 6 cross-backend tests + 1 InProcess-only test (history accumulation,
 * gated by `options.observesHistory`):
 *
 *   1. per-turn baseline — yields tokens + a single terminal finish
 *      then closes.
 *   2. multi-turn: first user message runs a turn AND emits `turn_end`
 *      (NOT `finish`) at the turn boundary — both backends.
 *   3. multi-turn: after the first `turn_end`, a second `sendMessage`
 *      produces a second token batch + another `turn_end` — both
 *      backends.
 *   4. multi-turn (InProcess-only): history accumulates across turns.
 *   5. multi-turn: abort signal yields tokens → `warning` (code endsWith
 *      `.aborted`) → terminal `finish` (reason `"aborted"`) — both
 *      backends.
 *   6. multi-turn: sendMessage on unknown sid throws
 *      AgentSessionUnknownSidError.
 *   7. multi-turn: sendMessage on closed (post-abort) sid throws
 *      AgentSessionUnknownSidError.
 *
 * Test #4 is backend-specific because lifed accumulates history
 * server-side and the WS protocol doesn't echo it back; only the
 * InProcess factory can observe per-turn history.
 *
 * Backends call `runAgentSessionClientContract(suiteName, makeClient,
 * options?)`; the harness owns describe/it blocks.
 *
 * `makeClient` returns a freshly-constructed client AND a `script`
 * — the script encodes the deterministic events the backend's
 * underlying substrate should yield per turn. For InProcess, the
 * script is fed through a fake `RealAgentRunner`; for LifedWs, the
 * script is fed through a fake `WebSocketFactory`.
 *
 * @see ../in-process-client.ts
 * @see ../lifed-ws-client.ts
 */

import { describe, expect, it } from "vitest";

import type {
  AgentSessionClient,
  AgentStreamInput,
  CanonicalAgentEvent,
} from "../types";

// ---------------------------------------------------------------------------
// Script shape — the per-backend factory wires this through its fake
// substrate. The contract harness only knows about the canonical events
// the backend should yield; the backend factories translate the events
// into whatever shape their fake substrate emits.
// ---------------------------------------------------------------------------

/**
 * One scripted turn — the substrate yields these canonical events in
 * order, then signals "turn end" (FINISH for WS / done for InProcess).
 *
 * `userMessageEcho`: when set, the harness uses this string to assert
 * the substrate observed the right user message for the turn. Each
 * backend's factory passes it through when wiring the fake.
 */
export interface ScriptedTurn {
  /** Token deltas the substrate emits this turn. */
  tokens: string[];
  /** Optional per-turn introspection — last user message the substrate saw. */
  userMessageEcho?: string;
  /**
   * Optional history snapshot the substrate observed at the start of
   * this turn. Set when a test wants to verify history accumulation
   * across turns (Test #4). Indexed against
   * `scriptedSubstrate.observedHistory[turnIndex]`.
   */
  historyEcho?: Array<{ role: "user" | "assistant"; content: string }>;
}

/**
 * The full script the test wires into the substrate. `turns[i]` defines
 * what the substrate emits on turn `i`. Multi-turn tests typically
 * have 2+ entries; per-turn tests have exactly one.
 */
export interface AgentSessionScript {
  turns: ScriptedTurn[];
}

/**
 * Per-turn observations the substrate records. Tests inspect this to
 * verify history accumulation, user-message routing, abort propagation.
 *
 * `history` is OPTIONAL — the LifedWs backend can't observe history
 * client-side (lifed accumulates it server-side and the WS protocol
 * doesn't echo it back), so the WS factory leaves it undefined and
 * the harness skips the history assertions for that backend.
 */
export interface SubstrateObservations {
  /**
   * Each entry is `{ userMessage, history? }` at the start of the turn.
   * `history` is populated only when the substrate is observable from
   * the client side (InProcess: yes; LifedWs: no).
   */
  observedTurns: Array<{
    userMessage: string;
    history?: Array<{ role: "user" | "assistant"; content: string }>;
  }>;
}

/**
 * The factory contract: a per-backend factory produces a fresh client
 * + the observations object the harness asserts against. The factory
 * controls how the script is fed into the underlying substrate.
 */
export type MakeClient = (script: AgentSessionScript) => {
  client: AgentSessionClient;
  observations: SubstrateObservations;
};

/**
 * Per-backend opt-ins for tests that genuinely cannot be cross-backend.
 *
 * `observesHistory`: when true, the harness runs the history-accumulation
 * test (Test #4). Only the InProcess backend can see history client-side;
 * lifed accumulates server-side and the WS protocol doesn't echo it back.
 * Setting this on a non-observable backend would deadlock on a false
 * assertion, so the test is explicitly gated.
 */
export interface ContractOptions {
  observesHistory?: boolean;
}

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

/**
 * Build a baseline `AgentStreamInput` for the contract suite. Tests
 * spread additional fields on top.
 */
function baseInput(sid: string): Omit<AgentStreamInput, "userMessage"> {
  return {
    sessionId: sid,
    agentId: "user:contract-test",
    projectSlug: "sentinel-property-ops",
    history: [],
    kernelCtx: {
      sessionId: sid,
      agentId: "user:contract-test",
    },
    // Provide a fake capability so the lifed-ws factory doesn't reject
    // on the no-capability path. InProcess ignores this field.
    capability: { token: "contract-test-cap", expiresAt: 9_999_999_999 },
  };
}

/**
 * Collect events from an async iterable until either the iterator
 * closes or we observe `count` events (whichever comes first).
 */
async function collectN(
  iter: AsyncIterable<CanonicalAgentEvent>,
  count: number,
): Promise<CanonicalAgentEvent[]> {
  const out: CanonicalAgentEvent[] = [];
  for await (const ev of iter) {
    out.push(ev);
    if (out.length >= count) break;
  }
  return out;
}

/**
 * Collect ALL events the iterator yields. Used after abort or when the
 * test expects the iterator to close on its own.
 */
async function collectAll(
  iter: AsyncIterable<CanonicalAgentEvent>,
): Promise<CanonicalAgentEvent[]> {
  const out: CanonicalAgentEvent[] = [];
  for await (const ev of iter) {
    out.push(ev);
  }
  return out;
}

/**
 * Yield the macrotask queue once so any pending `addEventListener` /
 * promise microtask resolutions land before the next assertion. Both
 * backends rely on event-loop scheduling for `open` / queue drain.
 */
const tick = (ms = 0) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Filter events to just the token deltas for assertion brevity.
 */
function tokenDeltas(events: CanonicalAgentEvent[]): string[] {
  return events
    .filter((e) => e.event.kind === "token")
    .map((e) => (e.event as { delta: string }).delta);
}

/**
 * Single entry point. Backends call:
 *
 *   runAgentSessionClientContract("InProcessAgentSessionClient", makeInProcessClient, { observesHistory: true });
 *   runAgentSessionClientContract("LifedWsAgentSessionClient", makeLifedWsClient);
 *
 * The harness owns describe/it. Tests are self-contained — each
 * constructs a fresh client + script. `options.observesHistory`
 * gates the InProcess-only history-accumulation test.
 */
export function runAgentSessionClientContract(
  suiteName: string,
  makeClient: MakeClient,
  options: ContractOptions = {},
): void {
  const { observesHistory = false } = options;
  describe(`${suiteName} — AgentSessionClient contract`, () => {
    // ---------------------------------------------------------------------
    // Test 1: per-turn baseline regression guard
    // ---------------------------------------------------------------------

    it("per-turn (multiTurn=false): yields tokens and a single finish then closes the iterator", async () => {
      const sid = `contract-pt-1-${Date.now()}`;
      const script: AgentSessionScript = {
        turns: [{ tokens: ["Hello", " world"] }],
      };
      const { client } = makeClient(script);

      const events = await collectAll(
        client.stream({
          ...baseInput(sid),
          userMessage: "say hi",
          // multiTurn omitted → per-turn path
        }),
      );

      const tokens = tokenDeltas(events);
      expect(tokens).toEqual(["Hello", " world"]);

      // Exactly one terminal finish — the per-turn iterator MUST close.
      const finishes = events.filter((e) => e.event.kind === "finish");
      expect(finishes).toHaveLength(1);

      // Iterator must be fully drained — collectAll() returned.
      expect(events[events.length - 1].event.kind).toBe("finish");
    });

    // ---------------------------------------------------------------------
    // Test 2: multi-turn first turn emits turn_end (not finish)
    // ---------------------------------------------------------------------

    it("multi-turn: first user message runs a turn and emits turn_end at the boundary", async () => {
      const sid = `contract-mt-1-${Date.now()}`;
      const script: AgentSessionScript = {
        turns: [{ tokens: ["First", " turn"] }, { tokens: ["never"] }],
      };
      const { client } = makeClient(script);
      const controller = new AbortController();

      const iter = client.stream({
        ...baseInput(sid),
        userMessage: "turn 1 prompt",
        multiTurn: true,
        signal: controller.signal,
      });

      // Pull events until we observe a turn_end. The substrate emits:
      //   [open] tokens (text_start/end inserted by InProcess) … turn_end
      // We assert the cross-backend contract: tokens land in order,
      // followed by exactly one `turn_end`, and NO `finish` event has
      // landed yet (the iterator stays parked for turn 2).
      const reader = iter[Symbol.asyncIterator]();
      const seen: CanonicalAgentEvent[] = [];
      let turnEndSeen = false;
      for (let i = 0; i < 30 && !turnEndSeen; i++) {
        const { value, done } = await reader.next();
        if (done) break;
        seen.push(value);
        if (value.event.kind === "turn_end") {
          turnEndSeen = true;
        }
      }
      expect(turnEndSeen).toBe(true);
      // Tokens arrived in order — the substrate yielded both deltas
      // before the turn boundary.
      expect(tokenDeltas(seen)).toEqual(["First", " turn"]);
      // Critical contract assertion: NO `finish` event fired before
      // `turn_end`. `finish` is the terminal-and-last event; between
      // turns the canonical marker is `turn_end`.
      const finishesBeforeBoundary = seen.filter(
        (e) => e.event.kind === "finish",
      );
      expect(finishesBeforeBoundary).toHaveLength(0);

      // Iterator is still alive — abort + drain succeeds in finite
      // iterations. If a terminal finish had fired earlier, the
      // iterator would have closed already.
      controller.abort();
      let drainCount = 0;
      while (drainCount < 50) {
        const { done } = await reader.next();
        drainCount += 1;
        if (done) break;
      }
      expect(drainCount).toBeLessThan(50);
    });

    // ---------------------------------------------------------------------
    // Test 3: multi-turn sendMessage triggers a second turn
    // ---------------------------------------------------------------------

    it("multi-turn: sendMessage after turn_end triggers a second turn that emits its own turn_end", async () => {
      const sid = `contract-mt-2-${Date.now()}`;
      const script: AgentSessionScript = {
        turns: [{ tokens: ["A"] }, { tokens: ["B"] }],
      };
      const { client } = makeClient(script);
      const controller = new AbortController();

      const iter = client.stream({
        ...baseInput(sid),
        userMessage: "first",
        multiTurn: true,
        signal: controller.signal,
      });

      // Pull events until turn 1's `turn_end` arrives — the explicit
      // turn-boundary marker. Both backends emit this; cross-backend
      // contract.
      const turn1Events: CanonicalAgentEvent[] = [];
      const reader = iter[Symbol.asyncIterator]();
      for (let i = 0; i < 30; i++) {
        const { value, done } = await reader.next();
        if (done) break;
        turn1Events.push(value);
        if (value.event.kind === "turn_end") break;
      }
      expect(tokenDeltas(turn1Events)).toContain("A");
      // Exactly one turn_end and zero finishes in turn 1.
      expect(
        turn1Events.filter((e) => e.event.kind === "turn_end"),
      ).toHaveLength(1);
      expect(turn1Events.filter((e) => e.event.kind === "finish")).toHaveLength(
        0,
      );

      // Fire the second turn.
      await client.sendMessage(sid, "second");

      // Pull events until turn 2's `turn_end` arrives.
      const turn2Events: CanonicalAgentEvent[] = [];
      for (let i = 0; i < 30; i++) {
        const { value, done } = await reader.next();
        if (done) break;
        turn2Events.push(value);
        if (value.event.kind === "turn_end") break;
      }
      expect(tokenDeltas(turn2Events)).toContain("B");
      // Turn 2 also yields exactly one turn_end + zero finishes.
      expect(
        turn2Events.filter((e) => e.event.kind === "turn_end"),
      ).toHaveLength(1);
      expect(turn2Events.filter((e) => e.event.kind === "finish")).toHaveLength(
        0,
      );

      // Cleanup — abort and drain.
      controller.abort();
      // Drain remaining events from the iterator until done.
      while (true) {
        const { done } = await reader.next();
        if (done) break;
      }
    });

    // ---------------------------------------------------------------------
    // Test 4: history accumulates across turns — InProcess-only.
    //
    // This is a backend-specific extension, NOT a cross-backend contract.
    // LifedWs accumulates history server-side and the WS protocol doesn't
    // echo it back, so the WS factory has no way to observe per-turn
    // history client-side. Gated by `options.observesHistory`.
    // ---------------------------------------------------------------------

    (observesHistory ? it : it.skip)(
      "multi-turn: history accumulates across turns (InProcess-observable backends only)",
      async () => {
        const sid = `contract-mt-3-${Date.now()}`;
        const script: AgentSessionScript = {
          turns: [
            { tokens: ["alpha"], userMessageEcho: "first" },
            { tokens: ["beta"], userMessageEcho: "second" },
          ],
        };
        const { client, observations } = makeClient(script);
        const controller = new AbortController();

        const iter = client.stream({
          ...baseInput(sid),
          userMessage: "first",
          multiTurn: true,
          signal: controller.signal,
        });
        const reader = iter[Symbol.asyncIterator]();

        // Pull turn 1 until "alpha".
        for (let i = 0; i < 10; i++) {
          const { value, done } = await reader.next();
          if (done) break;
          if (value.event.kind === "token" && value.event.delta === "alpha") {
            break;
          }
        }

        // Turn 1 observed: userMessage="first", history empty.
        expect(observations.observedTurns.length).toBeGreaterThanOrEqual(1);
        expect(observations.observedTurns[0].userMessage).toBe("first");
        // observesHistory === true ⇒ factory must populate history.
        expect(observations.observedTurns[0].history).toEqual([]);

        // Trigger turn 2.
        await client.sendMessage(sid, "second");

        // Pull turn 2 until "beta".
        for (let i = 0; i < 10; i++) {
          const { value, done } = await reader.next();
          if (done) break;
          if (value.event.kind === "token" && value.event.delta === "beta") {
            break;
          }
        }

        // Turn 2 observed: userMessage="second"; history includes
        // turn-1's {user, assistant} pair.
        expect(observations.observedTurns.length).toBeGreaterThanOrEqual(2);
        expect(observations.observedTurns[1].userMessage).toBe("second");
        expect(observations.observedTurns[1].history).toEqual([
          { role: "user", content: "first" },
          { role: "assistant", content: "alpha" },
        ]);

        // Cleanup.
        controller.abort();
        while (true) {
          const { done } = await reader.next();
          if (done) break;
        }
      },
    );

    // ---------------------------------------------------------------------
    // Test 5: abort signal yields tokens → warning → terminal finish.
    // Strict cross-backend parity — same event sequence for both
    // InProcess and LifedWs.
    // ---------------------------------------------------------------------

    it("multi-turn: abort signal yields tokens → warning(*.aborted) → terminal finish(reason='aborted')", async () => {
      const sid = `contract-mt-4-${Date.now()}`;
      const script: AgentSessionScript = {
        turns: [{ tokens: ["x"] }, { tokens: ["y"] }],
      };
      const { client } = makeClient(script);
      const controller = new AbortController();

      const iter = client.stream({
        ...baseInput(sid),
        userMessage: "first",
        multiTurn: true,
        signal: controller.signal,
      });

      const reader = iter[Symbol.asyncIterator]();
      // Pull until the "x" token lands; subsequent reads may park
      // (InProcess) or pick up a turn_end (WS), so we don't drain past
      // the token here.
      const turn1Events: CanonicalAgentEvent[] = [];
      for (let i = 0; i < 10; i++) {
        const { value, done } = await reader.next();
        if (done) break;
        turn1Events.push(value);
        if (value.event.kind === "token" && value.event.delta === "x") {
          break;
        }
      }
      expect(tokenDeltas(turn1Events)).toContain("x");

      // Abort and drain — collect every event until iterator done.
      controller.abort();
      const remaining: CanonicalAgentEvent[] = [];
      while (true) {
        const { value, done } = await reader.next();
        if (done) break;
        remaining.push(value);
      }

      // Exactly one TERMINAL `finish` with reason "aborted" — the
      // contract reserves `finish` for the one-and-only terminal event.
      // No `turn_end` event after abort (the abort path skips boundary
      // emission and goes straight to warning + terminal finish).
      const finishes = remaining.filter((e) => e.event.kind === "finish");
      expect(finishes).toHaveLength(1);
      const terminal = finishes[0];
      expect((terminal.event as { reason: string }).reason).toBe("aborted");
      // `finish` IS the last event (terminal-and-last invariant).
      expect(remaining[remaining.length - 1]).toBe(terminal);

      // Exactly one abort warning with a backend-suffixed code ending
      // in `.aborted` (e.g. `in-process.aborted` or `lifed-ws.aborted`).
      // Cross-backend parity: both surfaces emit this so consumers
      // distinguish "abort from client" from "transport collapsed".
      const warnings = remaining.filter(
        (e) =>
          e.event.kind === "warning" &&
          (e.event as { code: string }).code.endsWith(".aborted"),
      );
      expect(warnings).toHaveLength(1);

      // Sequence: warning lands BEFORE the terminal finish.
      const warningIdx = remaining.indexOf(warnings[0]);
      const finishIdx = remaining.indexOf(terminal);
      expect(warningIdx).toBeLessThan(finishIdx);
    });

    // ---------------------------------------------------------------------
    // Test 6: sendMessage on unknown sid throws
    // ---------------------------------------------------------------------

    it("multi-turn: sendMessage on unknown sid throws AgentSessionUnknownSidError", async () => {
      const script: AgentSessionScript = { turns: [{ tokens: ["x"] }] };
      const { client } = makeClient(script);

      await expect(
        client.sendMessage("sid-that-never-existed", "hi"),
      ).rejects.toMatchObject({
        name: "AgentSessionUnknownSidError",
        code: "agent-session.unknown_sid",
      });
    });

    // ---------------------------------------------------------------------
    // Test 7: sendMessage on closed (post-abort) sid throws
    // ---------------------------------------------------------------------

    it("multi-turn: sendMessage on closed (post-abort) sid throws AgentSessionUnknownSidError", async () => {
      const sid = `contract-mt-5-${Date.now()}`;
      const script: AgentSessionScript = {
        turns: [{ tokens: ["x"] }],
      };
      const { client } = makeClient(script);
      const controller = new AbortController();

      const iter = client.stream({
        ...baseInput(sid),
        userMessage: "first",
        multiTurn: true,
        signal: controller.signal,
      });
      const reader = iter[Symbol.asyncIterator]();
      for (let i = 0; i < 10; i++) {
        const { value, done } = await reader.next();
        if (done) break;
        if (value.event.kind === "token" && value.event.delta === "x") break;
      }
      controller.abort();
      // Drain.
      while (true) {
        const { done } = await reader.next();
        if (done) break;
      }
      // Give the finally-block any microtasks it needs to clean up.
      await tick();

      // After cleanup, the sid is gone.
      await expect(client.sendMessage(sid, "too late")).rejects.toMatchObject({
        name: "AgentSessionUnknownSidError",
        code: "agent-session.unknown_sid",
      });
    });
  });
}
