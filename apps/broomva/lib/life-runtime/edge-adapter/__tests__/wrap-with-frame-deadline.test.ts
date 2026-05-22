// Unit tests for `wrap-with-frame-deadline.ts`. Uses vitest fake
// timers to drive the per-frame deadline deterministically.
//
// BRO-1234 first PR — see module header for full context.

// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { CanonicalAgentEvent } from "@/lib/life-runtime/agent-session/types";
import {
  DEFAULT_FRAME_DEADLINE_MS,
  type FrameDeadlineLogger,
  getFrameDeadlineMs,
  wrapWithFrameDeadline,
} from "../wrap-with-frame-deadline";

function makeFakeLogger() {
  // Returned mocks satisfy the FrameDeadlineLogger shape; inference
  // preserves the Mock types so `.toHaveBeenCalledWith(...)` works.
  const log = {
    info: vi.fn<(data: object, msg: string) => void>(),
    warn: vi.fn<(data: object, msg: string) => void>(),
  } satisfies FrameDeadlineLogger;
  return log;
}

function env(ev: CanonicalAgentEvent["event"], seq = 1n): CanonicalAgentEvent {
  return { seq, event: ev } as CanonicalAgentEvent;
}

/**
 * Async iterable that yields the supplied frames and then completes
 * naturally. No artificial delays — used to verify the wrapper is a
 * pass-through when the source produces inside the deadline.
 */
async function* eager(
  frames: CanonicalAgentEvent[],
): AsyncIterable<CanonicalAgentEvent> {
  for (const f of frames) yield f;
}

/**
 * Async iterable that never yields anything. Each `next()` returns a
 * pending promise that resolves only when `release()` is called on the
 * returned handle. Used to simulate lifegw silence.
 */
function controllable(): {
  iter: AsyncIterable<CanonicalAgentEvent>;
  push: (ev: CanonicalAgentEvent | "end") => void;
} {
  const queue: Array<CanonicalAgentEvent | "end"> = [];
  let resolveNext: ((v: void) => void) | null = null;
  const wake = () => {
    const r = resolveNext;
    resolveNext = null;
    r?.();
  };
  const iter: AsyncIterable<CanonicalAgentEvent> = {
    [Symbol.asyncIterator]() {
      return {
        async next(): Promise<IteratorResult<CanonicalAgentEvent>> {
          while (queue.length === 0) {
            await new Promise<void>((resolve) => {
              resolveNext = resolve;
            });
          }
          const head = queue.shift()!;
          if (head === "end") return { value: undefined, done: true };
          return { value: head, done: false };
        },
      };
    },
  };
  return {
    iter,
    push: (ev) => {
      queue.push(ev);
      wake();
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("getFrameDeadlineMs", () => {
  it("returns default when env is unset", () => {
    vi.stubEnv("LIFEGW_FRAME_DEADLINE_MS", "");
    expect(getFrameDeadlineMs()).toBe(DEFAULT_FRAME_DEADLINE_MS);
  });

  it("returns default when env is non-numeric", () => {
    vi.stubEnv("LIFEGW_FRAME_DEADLINE_MS", "abc");
    expect(getFrameDeadlineMs()).toBe(DEFAULT_FRAME_DEADLINE_MS);
  });

  it("returns null (opt-out) when env is zero", () => {
    vi.stubEnv("LIFEGW_FRAME_DEADLINE_MS", "0");
    expect(getFrameDeadlineMs()).toBeNull();
  });

  it("returns null (opt-out) when env is negative", () => {
    vi.stubEnv("LIFEGW_FRAME_DEADLINE_MS", "-5");
    expect(getFrameDeadlineMs()).toBeNull();
  });

  it("returns the parsed value when env is a positive integer", () => {
    vi.stubEnv("LIFEGW_FRAME_DEADLINE_MS", "5000");
    expect(getFrameDeadlineMs()).toBe(5000);
  });
});

describe("wrapWithFrameDeadline — pass-through", () => {
  it("yields all frames unchanged when source completes inside deadline", async () => {
    const log = makeFakeLogger();
    const frames: CanonicalAgentEvent[] = [
      env({ kind: "token", delta: "hi", messageId: "m" } as never, 1n),
      env({ kind: "token", delta: " there", messageId: "m" } as never, 2n),
      env({ kind: "finish", reason: "stop" } as never, 3n),
    ];

    const out: CanonicalAgentEvent[] = [];
    for await (const ev of wrapWithFrameDeadline(eager(frames), 30_000, log)) {
      out.push(ev);
    }

    expect(out).toEqual(frames);
    // First-frame log fires exactly once on the first yielded frame.
    expect(log.info).toHaveBeenCalledTimes(1);
    expect(log.info).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "token" }),
      "lifegw first frame received",
    );
    expect(log.warn).not.toHaveBeenCalled();
  });

  it("returns cleanly on an empty source without emitting anything", async () => {
    const log = makeFakeLogger();
    const out: CanonicalAgentEvent[] = [];
    for await (const ev of wrapWithFrameDeadline(eager([]), 30_000, log)) {
      out.push(ev);
    }
    expect(out).toEqual([]);
    expect(log.info).not.toHaveBeenCalled();
    expect(log.warn).not.toHaveBeenCalled();
  });
});

describe("wrapWithFrameDeadline — deadline fires", () => {
  it("synthesises lifed.stream.no-first-frame + finish when source is silent", async () => {
    const log = makeFakeLogger();
    const { iter } = controllable(); // never push, never end

    const out: CanonicalAgentEvent[] = [];
    const drain = (async () => {
      for await (const ev of wrapWithFrameDeadline(iter, 30_000, log)) {
        out.push(ev);
      }
    })();

    // Advance fake-timer clock past the deadline; the wrapper's
    // setTimeout fires, Promise.race resolves "deadline", error+finish
    // are yielded, the loop returns.
    await vi.advanceTimersByTimeAsync(30_001);
    await drain;

    expect(out).toHaveLength(2);
    expect(out[0].event).toMatchObject({
      kind: "error",
      code: "lifed.stream.no-first-frame",
      message: expect.stringContaining("30000ms"),
    });
    expect(out[1].event).toMatchObject({ kind: "finish", reason: "error" });
    expect(log.warn).toHaveBeenCalledWith(
      expect.objectContaining({ deadlineMs: 30_000, frameCount: 0 }),
      "lifegw frame deadline exceeded before first frame",
    );
    expect(log.info).not.toHaveBeenCalled();
  });

  it("synthesises lifed.stream.frame-deadline after one frame then silence", async () => {
    const log = makeFakeLogger();
    const { iter, push } = controllable();

    const out: CanonicalAgentEvent[] = [];
    const drain = (async () => {
      for await (const ev of wrapWithFrameDeadline(iter, 30_000, log)) {
        out.push(ev);
      }
    })();

    // Push the first frame inside the deadline.
    push(env({ kind: "token", delta: "hi", messageId: "m" } as never, 1n));
    // Yield to the microtask queue so the wrapper's iter.next() resolves.
    await vi.advanceTimersByTimeAsync(0);
    // Source now goes silent — advance past the deadline.
    await vi.advanceTimersByTimeAsync(30_001);
    await drain;

    expect(out).toHaveLength(3);
    expect(out[0].event).toMatchObject({ kind: "token", delta: "hi" });
    expect(out[1].event).toMatchObject({
      kind: "error",
      code: "lifed.stream.frame-deadline",
      message: expect.stringContaining("after frame 1"),
    });
    expect(out[2].event).toMatchObject({ kind: "finish", reason: "error" });
    expect(log.info).toHaveBeenCalledTimes(1);
    expect(log.warn).toHaveBeenCalledWith(
      expect.objectContaining({ deadlineMs: 30_000, frameCount: 1 }),
      "lifegw frame deadline exceeded between frames",
    );
  });

  it("does NOT fire deadline if source completes exactly at boundary", async () => {
    const log = makeFakeLogger();
    const { iter, push } = controllable();

    const out: CanonicalAgentEvent[] = [];
    const drain = (async () => {
      for await (const ev of wrapWithFrameDeadline(iter, 30_000, log)) {
        out.push(ev);
      }
    })();

    push(env({ kind: "token", delta: "hi", messageId: "m" } as never, 1n));
    await vi.advanceTimersByTimeAsync(0);
    push(env({ kind: "finish", reason: "stop" } as never, 2n));
    await vi.advanceTimersByTimeAsync(0);
    push("end");
    await vi.advanceTimersByTimeAsync(0);
    await drain;

    expect(out).toHaveLength(2);
    expect(out[1].event).toMatchObject({ kind: "finish", reason: "stop" });
    // No synthesised error.
    expect(out.some((e) => (e.event as { kind?: string }).kind === "error")).toBe(false);
    expect(log.warn).not.toHaveBeenCalled();
  });
});

describe("wrapWithFrameDeadline — synthesised frame seq numbers", () => {
  it("uses high BigInt seqs so synthesised frames are distinguishable from real ones", async () => {
    const log = makeFakeLogger();
    const { iter } = controllable();
    const out: CanonicalAgentEvent[] = [];
    const drain = (async () => {
      for await (const ev of wrapWithFrameDeadline(iter, 1_000, log)) {
        out.push(ev);
      }
    })();
    await vi.advanceTimersByTimeAsync(1_001);
    await drain;

    expect(out).toHaveLength(2);
    // Both synthesised frames have seqs >= 9e15, well past any
    // realistic upstream sequence.
    expect(out[0].seq).toBeGreaterThanOrEqual(BigInt("9000000000000000"));
    expect(out[1].seq).toBeGreaterThan(out[0].seq);
  });
});
