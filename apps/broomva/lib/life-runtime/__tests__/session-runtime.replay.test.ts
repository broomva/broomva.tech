// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

// Same mock setup as session-runtime.welcome.test.ts — server-only,
// @broomva/prosopon, and ./canonical all need stubs under raw Node
// because session-runtime.ts begins with "server-only" and pulls in
// the DB-validator chain through canonical.ts. See the welcome test
// for the full rationale.
vi.mock("server-only", () => ({}));
vi.mock("@broomva/prosopon", () => ({
  makeEnvelope: (args: unknown) => args,
}));
vi.mock("../canonical", () => ({
  createLifeRuntime: () => ({
    run: async () => ({ kind: "envelopes", stream: (async function* () {})() }),
  }),
}));

import { streamSession } from "../session-runtime";

async function collect(
  sid: string,
  fromSeq: bigint,
  timeoutMs: number,
): Promise<Array<{ seq: string | number | bigint }>> {
  const controller = new AbortController();
  const out: Array<{ seq: string | number | bigint }> = [];
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    for await (const env of streamSession({
      sid,
      fromSeq,
      signal: controller.signal,
    })) {
      out.push(env as unknown as { seq: string | number | bigint });
    }
  } catch {
    // AbortError expected after timer fires.
  } finally {
    clearTimeout(timer);
  }
  return out;
}

describe("streamSession replay-on-read", () => {
  it("replays the welcome arc on multiple subscriptions to the same sid", async () => {
    const sid = `test-replay-${crypto.randomUUID()}`;
    // First subscription fires the seed (5 envelopes from seedFreshSession).
    const first = await collect(sid, 0n, 80);
    expect(first).toHaveLength(5);
    // Second subscription replays the same 5 envelopes — buffer was NOT drained.
    // This is the bug Plan D fixed.
    const second = await collect(sid, 0n, 80);
    expect(second).toHaveLength(5);
    // And a third confirms the replay is stable, not consumed.
    const third = await collect(sid, 0n, 80);
    expect(third).toHaveLength(5);
  });

  it("honors fromSeq — replay skips envelopes at or before the cursor", async () => {
    const sid = `test-fromseq-${crypto.randomUUID()}`;
    const all = await collect(sid, 0n, 80);
    expect(all).toHaveLength(5);
    // Subscribe again starting after seq 2 — should get envelopes 3, 4, 5.
    // seedFreshSession emits 5 envelopes with seq 1..5 (emit increments
    // nextSeq before each, starting at 1).
    const tail = await collect(sid, 2n, 80);
    expect(tail).toHaveLength(3);
    // fromSeq = 5 ⇒ no envelopes (all ≤ cursor).
    const empty = await collect(sid, 5n, 80);
    expect(empty).toHaveLength(0);
  });
});
