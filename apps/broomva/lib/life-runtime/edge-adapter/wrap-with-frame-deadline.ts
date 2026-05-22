/**
 * Wrap a `CanonicalAgentEvent` async iterable with a per-frame deadline.
 *
 * If `deadlineMs` elapses between frames (or before the first frame),
 * yield a synthetic `{kind:"error", code, message}` envelope followed
 * by a `{kind:"finish", reason:"error"}` envelope, then exit. The
 * downstream `canonicalToVercelAiSdkSse` translator already turns
 * `error` events into `UIMessageChunk` errors, so the route surfaces a
 * visible error within `deadlineMs` instead of waiting on the Vercel
 * function's 290-second AbortController timeout (which today manifests
 * as a silent 504 to the client).
 *
 * The wrapper is observability + UX: it converts a silent gateway-side
 * hang into a structured, visible failure mode that future iterations
 * can grep on in Vercel + Railway logs. It does NOT fix the underlying
 * hang — that lives in the lifed → arcan → Vercel-AI-Gateway path and
 * needs its own instrumentation PR (see BRO-1234 §"Suggested second
 * PR (broomva/life)").
 *
 * Spec: BRO-1234 first PR — handoff at
 * `~/broomva/docs/handoffs/2026-05-22-bro-1208-streaming-hang-handoff.md`
 * §"Suggested first PR".
 */

import "server-only";
import type { CanonicalAgentEvent } from "@/lib/life-runtime/agent-session/types";

/**
 * Default per-frame deadline. 30s is the canonical figure from the
 * BRO-1234 handoff — long enough to absorb a slow first inference from
 * the gateway (cold-start, throttled, very long prompt), short enough
 * that the user sees an error well inside Vercel's 290s function
 * timeout.
 */
export const DEFAULT_FRAME_DEADLINE_MS = 30_000;

/**
 * Resolve the per-frame deadline from env or default.
 *
 * `LIFEGW_FRAME_DEADLINE_MS` env override:
 *   - unset / empty → `DEFAULT_FRAME_DEADLINE_MS`
 *   - non-numeric → `DEFAULT_FRAME_DEADLINE_MS` (fail safe)
 *   - `<= 0` → `null` (opt-out; wrapper is a no-op)
 *   - positive integer → that value in milliseconds
 *
 * The opt-out exists for benchmarking + load tests where artificial
 * per-frame deadlines obscure real latency distributions. Production
 * deployments should leave this unset.
 */
export function getFrameDeadlineMs(): number | null {
  const raw = process.env.LIFEGW_FRAME_DEADLINE_MS;
  if (raw === undefined || raw === "") return DEFAULT_FRAME_DEADLINE_MS;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_FRAME_DEADLINE_MS;
  if (parsed <= 0) return null;
  return parsed;
}

/**
 * Minimal logger surface this wrapper needs. Compatible with
 * `createModuleLogger("...")` from `@/lib/logger` — pass that
 * directly. Kept narrow so the wrapper is easy to test with a stub.
 */
export interface FrameDeadlineLogger {
  info: (data: object, msg: string) => void;
  warn: (data: object, msg: string) => void;
}

/**
 * Synthesised-frame seq numbers start past 2^53 so they're trivially
 * distinguishable from any real lifegw sequence in trace output. The
 * translator keys text chunks by their `messageId`, not by `seq`, so
 * this choice doesn't break id correlation downstream.
 */
const SYNTH_SEQ_BASE = BigInt("9000000000000000");

/**
 * Wrap the canonical event iterator with a per-frame deadline.
 *
 * Each call to `iter.next()` races against `setTimeout(deadlineMs)`.
 * If the timer wins, the wrapper synthesises a terminal error+finish
 * pair and returns. The original iterator is left for GC — we
 * deliberately do NOT call `iter.return()` because the upstream WS
 * may still be draining and a forced cancellation can race with the
 * auth-close-code path in lifed-ws-client. The synthetic finish is
 * enough for the downstream `createUIMessageStream` wrapper to exit
 * cleanly, and the abandoned iterator is GC'd once the response
 * Promise resolves.
 */
export async function* wrapWithFrameDeadline(
  source: AsyncIterable<CanonicalAgentEvent>,
  deadlineMs: number,
  log: FrameDeadlineLogger,
): AsyncIterable<CanonicalAgentEvent> {
  const iter = source[Symbol.asyncIterator]();
  const tStart = Date.now();
  let frameCount = 0;

  while (true) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const next = iter.next();
    const deadline = new Promise<"deadline">((resolve) => {
      timer = setTimeout(() => resolve("deadline"), deadlineMs);
    });

    let result: IteratorResult<CanonicalAgentEvent> | "deadline";
    try {
      result = await Promise.race([next, deadline]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }

    if (result === "deadline") {
      const elapsedMs = Date.now() - tStart;
      log.warn(
        {
          deadlineMs,
          frameCount,
          elapsedMs,
        },
        frameCount === 0
          ? "lifegw frame deadline exceeded before first frame"
          : "lifegw frame deadline exceeded between frames",
      );
      yield {
        seq: SYNTH_SEQ_BASE,
        event: {
          kind: "error",
          code:
            frameCount === 0
              ? "lifed.stream.no-first-frame"
              : "lifed.stream.frame-deadline",
          message:
            frameCount === 0
              ? `No first frame from lifegw within ${deadlineMs}ms`
              : `No frame from lifegw within ${deadlineMs}ms after frame ${frameCount}`,
        },
      } as CanonicalAgentEvent;
      yield {
        seq: SYNTH_SEQ_BASE + 1n,
        event: { kind: "finish", reason: "error" },
      } as CanonicalAgentEvent;
      return;
    }

    if (result.done) return;

    frameCount += 1;
    if (frameCount === 1) {
      log.info(
        {
          msToFirstFrame: Date.now() - tStart,
          kind: result.value.event.kind,
        },
        "lifegw first frame received",
      );
    }
    yield result.value;
  }
}
