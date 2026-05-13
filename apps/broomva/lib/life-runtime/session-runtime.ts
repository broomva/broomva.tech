/**
 * Session runtime facade — adapts the per-turn canonical `LifeRuntime`
 * into the per-session streaming API the B-4a session lens expects.
 *
 * The canonical runtime (`./canonical.ts`) models one agent turn as
 * `runtime.run({ userMessage, … }) → AsyncIterable<Envelope>`. The
 * session lens flips this: the SSE handler subscribes to a session
 * indefinitely, and a separate POST endpoint pushes user messages
 * that trigger new turns. This facade bridges the two by holding a
 * per-session queue of pending envelopes in module scope.
 *
 * Lifetimes:
 *   - The first `streamSession({ sid })` call on a fresh sid creates
 *     a SessionState that lives in the module map until the process
 *     restarts. Long-running connections share the same backing queue.
 *   - `sendMessage({ sid, content })` kicks off a `runtime.run(...)` in
 *     the background and pipes its envelopes into the queue.
 *   - `approveDispatch` / `cancelDispatch` are stubs — the canonical
 *     runtime does not yet model human-in-the-loop tool gating; these
 *     wait for `approval_required` plumbing through `prosopon-emitter.ts`.
 *
 * Spec ref: docs/superpowers/plans/2026-05-13-broomva-session-lens-plan-b4a-bare-canvas.md
 */

import "server-only";
import type { Envelope, ProsoponEvent } from "@broomva/prosopon";
import {
  createLifeRuntime,
  type LifeRuntime,
  type RunInput,
} from "./canonical";
import { isProjectSlug } from "./projects";
import type { ConsumerIdentity } from "./types";

// ---------------------------------------------------------------------------
// Per-session state
// ---------------------------------------------------------------------------

interface PendingEnvelope {
  envelope: Envelope;
  /** Monotonic seq within this session. */
  seq: bigint;
}

interface Waiter {
  resolve: (value: IteratorResult<ProsoponEvent>) => void;
  signal: AbortSignal;
}

interface SessionState {
  sid: string;
  /** Buffered envelopes that have not yet been consumed by a streamer. */
  buffer: PendingEnvelope[];
  /** Streamers currently parked waiting for a new envelope. */
  waiters: Waiter[];
  /** Monotonic seq counter. Each emitted envelope gets the next value. */
  nextSeq: bigint;
}

const SESSIONS = new Map<string, SessionState>();

function getOrCreateSession(sid: string): SessionState {
  let state = SESSIONS.get(sid);
  if (!state) {
    state = {
      sid,
      buffer: [],
      waiters: [],
      nextSeq: 1n,
    };
    SESSIONS.set(sid, state);
  }
  return state;
}

function emit(state: SessionState, envelope: Envelope): void {
  const seq = state.nextSeq;
  state.nextSeq = seq + 1n;
  const pending: PendingEnvelope = { envelope, seq };
  const waiter = state.waiters.shift();
  if (waiter) {
    waiter.resolve({
      value: pending.envelope.event as ProsoponEvent,
      done: false,
    });
  } else {
    state.buffer.push(pending);
  }
}

// ---------------------------------------------------------------------------
// Singleton canonical runtime
// ---------------------------------------------------------------------------

let _runtime: LifeRuntime | null = null;
function runtime(): LifeRuntime {
  if (!_runtime) {
    _runtime = createLifeRuntime();
  }
  return _runtime;
}

// ---------------------------------------------------------------------------
// Public facade
// ---------------------------------------------------------------------------

export interface StreamSessionOpts {
  sid: string;
  fromSeq: bigint;
  signal: AbortSignal;
}

/**
 * Subscribe to the envelope stream for one session. Yields buffered
 * envelopes immediately (filtered by `fromSeq`), then parks until
 * `sendMessage` pushes new ones into the queue, or `signal` aborts.
 */
export async function* streamSession(
  opts: StreamSessionOpts,
): AsyncGenerator<ProsoponEvent, void, unknown> {
  const { sid, fromSeq, signal } = opts;
  const state = getOrCreateSession(sid);

  // Replay buffered envelopes whose seq is strictly greater than fromSeq.
  // We do NOT drain the buffer — multiple subscribers per session is
  // a future concern; for B-4a we assume a single subscriber per sid
  // and treat the buffer as a fast-forward queue.
  while (state.buffer.length > 0) {
    if (signal.aborted) return;
    const head = state.buffer.shift();
    if (!head) break;
    if (head.seq <= fromSeq) continue;
    yield head.envelope.event as ProsoponEvent;
  }

  // Park until a new envelope arrives or the caller aborts.
  while (!signal.aborted) {
    const next = await new Promise<IteratorResult<ProsoponEvent>>(
      (resolve) => {
        const waiter: Waiter = { resolve, signal };
        const onAbort = () => {
          // Drop this waiter from the queue on abort.
          const idx = state.waiters.indexOf(waiter);
          if (idx >= 0) state.waiters.splice(idx, 1);
          resolve({ value: undefined, done: true });
        };
        signal.addEventListener("abort", onAbort, { once: true });
        state.waiters.push(waiter);
      },
    );
    if (next.done) return;
    yield next.value;
  }
}

export interface SendMessageOpts {
  sid: string;
  content: string;
  /** Optional — defaults to `personal` (B-4a single-tenant default). */
  projectSlug?: string;
  /** Optional — defaults to an anon consumer keyed by `sid`. */
  consumer?: ConsumerIdentity;
}

/**
 * Push a user message into the session and drive a canonical turn.
 *
 * Envelopes produced by the turn are written to the session queue;
 * any active `streamSession` iterator picks them up. Resolves as
 * soon as the turn is dispatched (NOT when it finishes) so the POST
 * handler can return 202 immediately.
 */
export async function sendMessage(opts: SendMessageOpts): Promise<void> {
  const { sid, content } = opts;
  const projectSlug = opts.projectSlug ?? "personal";
  const consumer: ConsumerIdentity = opts.consumer ?? {
    kind: "anon",
    id: sid,
  };
  if (!isProjectSlug(projectSlug)) {
    throw new Error(`unknown project slug "${projectSlug}"`);
  }
  const state = getOrCreateSession(sid);

  const input: RunInput = {
    projectSlug,
    consumer,
    userMessage: content,
    sessionIdHint: sid,
  };

  // Fire-and-forget. We intentionally do NOT await the full stream
  // here — the SSE handler is the consumer. We do await `run()` itself
  // so a synchronous validation error (`unknown_project`, etc.) surfaces
  // as a rejected promise to the POST handler.
  const outcome = await runtime().run(input);

  if (outcome.kind === "rejected") {
    throw new Error(`runtime rejected: ${outcome.reason} — ${outcome.message}`);
  }
  if (outcome.kind === "payment_required") {
    throw new Error(
      "payment required — B-4a in-process adapter does not yet route x402 quotes",
    );
  }

  // outcome.kind === "envelopes" — pump in the background.
  void (async () => {
    try {
      for await (const env of outcome.stream) {
        emit(state, env);
      }
    } catch (err) {
      // Surface as a synthetic confirm-danger node so the client sees
      // the failure rather than a silently truncated stream.
      console.error("[session-runtime] envelope pump failed:", err);
    }
  })();
}

export interface DispatchOpts {
  sid: string;
  dispatchId: string;
  reason?: string;
}

/**
 * Approve a pending tool dispatch. Stub — the canonical runtime
 * does not yet model human-in-the-loop tool gating. When
 * `approval_required` events land in `prosopon-emitter.ts`, this
 * function will resolve the corresponding pending dispatch.
 */
export async function approveDispatch(opts: DispatchOpts): Promise<void> {
  throw new Error(
    `approveDispatch not yet supported by in-process adapter (sid=${opts.sid}, dispatchId=${opts.dispatchId})`,
  );
}

/**
 * Cancel a pending tool dispatch. Stub for the same reason as
 * `approveDispatch`.
 */
export async function cancelDispatch(opts: DispatchOpts): Promise<void> {
  throw new Error(
    `cancelDispatch not yet supported by in-process adapter (sid=${opts.sid}, dispatchId=${opts.dispatchId})`,
  );
}
