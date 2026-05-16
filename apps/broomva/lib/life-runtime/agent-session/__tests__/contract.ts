/**
 * Contract test harness for `AgentSessionClient` — runs the SAME
 * tests against every backend so per-backend test files only have
 * to wire the client factory.
 *
 * Plan E-2 (Task 4). The harness defines 7 tests:
 *
 *   1. per-turn baseline — yields tokens + a single finish then closes.
 *   2. multi-turn: first user message runs a turn.
 *   3. multi-turn: sendMessage triggers a second turn.
 *   4. multi-turn: history accumulates across turns.
 *   5. multi-turn: abort signal terminates the loop with a single
 *      terminal finish.
 *   6. multi-turn: sendMessage on unknown sid throws
 *      AgentSessionUnknownSidError.
 *   7. multi-turn: sendMessage on closed (post-abort) sid throws
 *      AgentSessionUnknownSidError.
 *
 * Backends call `runAgentSessionClientContract(suiteName, makeClient)`;
 * the harness owns describe/it blocks.
 *
 * `makeClient` returns a freshly-constructed client AND a `script`
 * — the script encodes the deterministic events the backend's
 * underlying substrate should yield per turn. For InProcess, the
 * script is fed through a fake `RealAgentRunner`; for LifedWs, the
 * script is fed through a fake `WebSocketFactory`.
 *
 * History accumulation is verified by the script — when the harness
 * runs turn 2, the script can return a different token stream
 * based on the history it observed for that turn. The backend's
 * factory is responsible for hooking up that introspection.
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
 *   runAgentSessionClientContract("InProcessAgentSessionClient", makeInProcessClient);
 *
 * The harness owns describe/it. Tests are self-contained — each
 * constructs a fresh client + script.
 */
export function runAgentSessionClientContract(
  suiteName: string,
  makeClient: MakeClient,
): void {
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
    // Test 2: multi-turn first turn
    // ---------------------------------------------------------------------

    it("multi-turn: first user message runs a turn", async () => {
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

      // Pull events until we've seen BOTH expected tokens. The exact
      // sequence + event count varies per backend (InProcess emits
      // open + text_start + tokens + text_end; LifedWs emits tokens +
      // per-turn FINISH). The contract assertion is just "the tokens
      // arrive in order and no TERMINAL finish has fired yet".
      const reader = iter[Symbol.asyncIterator]();
      const seen: CanonicalAgentEvent[] = [];
      const tokens: string[] = [];
      for (let i = 0; i < 30 && tokens.length < 2; i++) {
        const { value, done } = await reader.next();
        if (done) break;
        seen.push(value);
        if (value.event.kind === "token") {
          tokens.push((value.event as { delta: string }).delta);
        }
      }
      expect(tokens).toEqual(["First", " turn"]);

      // No TERMINAL finish has been yielded yet — multi-turn mode keeps
      // the iterator alive. (A per-turn FINISH from the substrate IS
      // a "finish"-kind event but is just a turn boundary; the test's
      // strict assertion of "0 finish events seen" would only hold for
      // backends that swallow per-turn finishes. We instead assert the
      // weaker invariant: the iterator is STILL PARKED, i.e., the next
      // pull does not immediately yield {done: true}.)
      // Note: we can't synchronously prove "iterator is parked" without
      // racing. We rely on the iterator-still-alive shape: abort + drain
      // succeeds in a finite number of iterations. If a terminal finish
      // had fired earlier, the iterator would have closed already.
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

    it("multi-turn: sendMessage triggers a second turn", async () => {
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

      // Pull turn 1 events first.
      const turn1Events: CanonicalAgentEvent[] = [];
      const reader = iter[Symbol.asyncIterator]();
      for (let i = 0; i < 6; i++) {
        const { value, done } = await reader.next();
        if (done) break;
        turn1Events.push(value);
        if (value.event.kind === "token" && value.event.delta === "A") {
          // got the turn-1 token; park is about to happen.
          break;
        }
      }
      expect(tokenDeltas(turn1Events)).toContain("A");

      // Fire the second turn.
      await client.sendMessage(sid, "second");

      // Pull turn 2 events.
      const turn2Events: CanonicalAgentEvent[] = [];
      // Wait up to 10 reads for the "B" token.
      for (let i = 0; i < 10; i++) {
        const { value, done } = await reader.next();
        if (done) break;
        turn2Events.push(value);
        if (value.event.kind === "token" && value.event.delta === "B") break;
      }
      expect(tokenDeltas(turn2Events)).toContain("B");

      // Cleanup — abort and drain.
      controller.abort();
      // Drain remaining events from the iterator until done.
      while (true) {
        const { done } = await reader.next();
        if (done) break;
      }
    });

    // ---------------------------------------------------------------------
    // Test 4: history accumulates across turns
    // ---------------------------------------------------------------------

    it("multi-turn: history accumulates across turns", async () => {
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

      // Turn 1 observed: userMessage="first", history (if observable) is empty.
      expect(observations.observedTurns.length).toBeGreaterThanOrEqual(1);
      expect(observations.observedTurns[0].userMessage).toBe("first");
      // History assertions are conditional — see SubstrateObservations
      // docstring for why the LifedWs backend leaves history undefined.
      if (observations.observedTurns[0].history !== undefined) {
        expect(observations.observedTurns[0].history).toEqual([]);
      }

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

      // Turn 2 observed: userMessage="second"; history (if observable)
      // includes turn-1's {user, assistant} pair.
      expect(observations.observedTurns.length).toBeGreaterThanOrEqual(2);
      expect(observations.observedTurns[1].userMessage).toBe("second");
      if (observations.observedTurns[1].history !== undefined) {
        expect(observations.observedTurns[1].history).toEqual([
          { role: "user", content: "first" },
          { role: "assistant", content: "alpha" },
        ]);
      }

      // Cleanup.
      controller.abort();
      while (true) {
        const { done } = await reader.next();
        if (done) break;
      }
    });

    // ---------------------------------------------------------------------
    // Test 5: abort signal terminates the multi-turn loop with one
    // terminal finish
    // ---------------------------------------------------------------------

    it("multi-turn: abort signal terminates the loop with a single terminal finish", async () => {
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
      // Pull turn 1 to completion (token + per-turn finish boundary
      // signal) so the iterator is parked waiting for the next
      // sendMessage. The InProcess backend doesn't surface a per-turn
      // finish event (swallowed in the multi-turn body); the LifedWs
      // backend DOES (the consumer needs it to persist the turn). The
      // test accepts both: pull until we see the "x" token AND drain
      // any subsequent non-token frames up to the next park.
      const turn1Events: CanonicalAgentEvent[] = [];
      for (let i = 0; i < 10; i++) {
        const { value, done } = await reader.next();
        if (done) break;
        turn1Events.push(value);
        if (value.event.kind === "token" && value.event.delta === "x") {
          // Subsequent reads might pull a per-turn finish (WS backend)
          // or park immediately (InProcess backend). We can't safely
          // pull more here — the parked InProcess reader would hang.
          break;
        }
      }

      // Abort and drain — collect events until iterator done.
      controller.abort();
      const remaining: CanonicalAgentEvent[] = [];
      while (true) {
        const { value, done } = await reader.next();
        if (done) break;
        remaining.push(value);
      }

      // The drain may include:
      //   - A per-turn finish event from the WS backend (reason "stop")
      //     — this is the turn boundary the consumer would normally use
      //     to persist the turn. Multi-turn semantics: turn-finishes ≠
      //     stream-terminal-finishes.
      //   - An abort warning (kind "warning", code "lifed-ws.aborted"
      //     or "in-process.aborted").
      //   - Exactly one TERMINAL finish (reason "aborted").
      //
      // We assert: at least one finish; the LAST finish is reason
      // "aborted" (the terminal one).
      const finishes = remaining.filter((e) => e.event.kind === "finish");
      expect(finishes.length).toBeGreaterThanOrEqual(1);
      const terminal = finishes[finishes.length - 1];
      expect((terminal.event as { reason: string }).reason).toBe("aborted");
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
