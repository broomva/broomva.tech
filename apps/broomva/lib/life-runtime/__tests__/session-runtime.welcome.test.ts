// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

// `session-runtime.ts` begins with `import "server-only"` which blocks it
// from loading in node-side test environments. Stub it out.
vi.mock("server-only", () => ({}));

// The `@broomva/prosopon` package ships an ESM `dist/` whose re-exports
// don't resolve cleanly under Vitest's raw Node loader (Next.js handles it
// at runtime). Passthrough `makeEnvelope` is sufficient — the test reads
// `event.node.intent` off the yielded envelope, which is exactly what we
// pass through.
vi.mock("@broomva/prosopon", () => ({
  makeEnvelope: (args: unknown) => args,
}));

// `./canonical` transitively imports the DB client + env validators which
// fail under raw Node without a populated env. We only exercise the seed
// path which never touches the canonical runtime, so we stub it out.
vi.mock("../canonical", () => ({
  createLifeRuntime: () => ({
    run: async () => ({ kind: "envelopes", stream: (async function* () {})() }),
  }),
}));

import { streamSession } from "../session-runtime";

/**
 * The session-runtime's seedFreshSession helper is private, but its
 * side-effects are observable through the public `streamSession` API:
 * a fresh session's buffered envelopes are exactly the seed sequence.
 *
 * We drain the buffered envelopes by iterating streamSession with an
 * already-aborted-after-N-envelopes signal — but since seedFreshSession
 * buffers eagerly into state.buffer before any streamer is parked, the
 * first stream call replays them synchronously up front and only THEN
 * parks for new ones. We use a short setTimeout abort so the test exits
 * cleanly after consuming the seed.
 */

async function collectSeed(sid: string): Promise<unknown[]> {
  const controller = new AbortController();
  const out: unknown[] = [];
  // Abort the stream after 50ms so it stops parking for new envelopes.
  const timer = setTimeout(() => controller.abort(), 50);
  try {
    for await (const env of streamSession({
      sid,
      fromSeq: 0n,
      signal: controller.signal,
    })) {
      out.push(env);
    }
  } catch {
    // AbortError or "stream aborted" — expected after the timer fires.
  } finally {
    clearTimeout(timer);
  }
  return out;
}

describe("seedFreshSession", () => {
  it("emits exactly 5 envelopes for a fresh session", async () => {
    const sid = `test-fresh-${crypto.randomUUID()}`;
    const envelopes = await collectSeed(sid);
    expect(envelopes).toHaveLength(5);
  });

  it("emits envelopes in the expected order: spec, quickstart, intro prose, welcome.md, follow-up prose", async () => {
    const sid = `test-order-${crypto.randomUUID()}`;
    const envelopes = (await collectSeed(sid)) as Array<{
      event: {
        type: string;
        node: {
          id: string;
          intent: {
            type?: string;
            name?: string;
            args?: { path?: string };
            text?: string;
          };
        };
      };
    }>;
    expect(envelopes.map((e) => e.event.node.intent.type)).toEqual([
      "tool_call",
      "tool_call",
      "prose",
      "tool_call",
      "prose",
    ]);
    expect(envelopes[0].event.node.intent.args?.path).toBe(
      "agents/broomva/spec.md",
    );
    expect(envelopes[1].event.node.intent.args?.path).toBe(
      "notes/quickstart.md",
    );
    expect(envelopes[2].event.node.intent.text).toMatch(/I'm Broomva/);
    expect(envelopes[3].event.node.intent.args?.path).toBe("welcome.md");
    expect(envelopes[4].event.node.intent.text).toMatch(
      /Where would you like to start/,
    );
  });

  it("is idempotent — seed fires once but the buffer replays on every subscription (Plan D replay-on-read)", async () => {
    const sid = `test-idempotent-${crypto.randomUUID()}`;
    const first = await collectSeed(sid);
    const second = await collectSeed(sid);
    // Both subscriptions see the same 5 envelopes. Plan D made the buffer
    // append-only with replay-on-read; the seed runs once (state.nextSeq
    // guard) but the envelopes it emitted stay buffered for refresh and
    // multi-tab. Prior to Plan D this test asserted second.length === 0
    // because the buffer was drained on the first read — that was the
    // bug Plan D fixed.
    expect(first).toHaveLength(5);
    expect(second).toHaveLength(5);
    // Same envelope sequence on both reads (seed didn't re-emit; buffer
    // just replayed).
    expect(second[0]).toEqual(first[0]);
    expect(second[4]).toEqual(first[4]);
  });
});
