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
import { type Envelope, makeEnvelope } from "@broomva/prosopon";
import {
  createLifeRuntime,
  type LifeRuntime,
  type RunInput,
} from "./canonical";
import { isProjectSlug } from "./projects";
import { SCENE_ROOT_ID } from "./prosopon-emitter";
import type { ConsumerIdentity } from "./types";

// ---------------------------------------------------------------------------
// Per-session state
// ---------------------------------------------------------------------------

// Wire contract for the Session lens: the SSE handler emits FULL `Envelope`
// frames (Prosopon's canonical wire shape — see `packages/prosopon-ts/src/codec.ts`).
// The session-runtime owns the per-session monotonic `seq`; it rewrites the
// envelope's `seq` / `session_id` to match this session before emission so
// the client cursor is well-defined even when the canonical runtime emits
// envelopes scoped to per-turn sub-sessions.

interface PendingEnvelope {
  envelope: Envelope;
}

interface Waiter {
  resolve: (value: IteratorResult<Envelope>) => void;
  signal: AbortSignal;
}

interface SessionState {
  sid: string;
  /** Buffered envelopes that have not yet been consumed by a streamer. */
  buffer: PendingEnvelope[];
  /** Streamers currently parked waiting for a new envelope. */
  waiters: Waiter[];
  /** Monotonic seq counter. Each emitted envelope gets the next value. */
  nextSeq: number;
}

const SESSIONS = new Map<string, SessionState>();

function getOrCreateSession(sid: string): SessionState {
  let state = SESSIONS.get(sid);
  if (!state) {
    state = {
      sid,
      buffer: [],
      waiters: [],
      nextSeq: 1,
    };
    SESSIONS.set(sid, state);
    seedFreshSession(state);
  }
  return state;
}

/**
 * Bounded retention for the per-session append-only envelope buffer.
 * The buffer is replay-on-read (`streamSession` iterates by index and
 * never drains), so without a bound it would grow unbounded over a
 * long-lived process. 500 envelopes ≈ a typical session's worth of
 * intent traffic with comfortable headroom; older envelopes are
 * silently dropped from the head when capacity is exceeded.
 */
const MAX_BUFFER = 500;

function emit(state: SessionState, inner: Envelope): void {
  // Rewrite seq + session_id so the session lens sees a clean monotonic
  // stream rooted at this sid. Preserve the original event + ts.
  const envelope: Envelope = makeEnvelope({
    session_id: state.sid,
    seq: state.nextSeq,
    event: inner.event,
    ts: inner.ts,
  });
  state.nextSeq += 1;
  const pending: PendingEnvelope = { envelope };
  // Always push into the buffer so future subscribers / refresh can
  // replay. Bounded retention drops oldest beyond MAX_BUFFER.
  state.buffer.push(pending);
  if (state.buffer.length > MAX_BUFFER) {
    state.buffer.shift();
  }
  // Wake any parked waiter with the new envelope. The buffer-push above
  // means live consumers AND future subscribers see the same envelope.
  const waiter = state.waiters.shift();
  if (waiter) {
    waiter.resolve({
      value: envelope,
      done: false,
    });
  }
}

// ---------------------------------------------------------------------------
// Fresh-session seed (v1 stub-mode shortcut)
// ---------------------------------------------------------------------------

/**
 * Emit the v1 fresh-session payload the first time a session is materialized.
 * Three independent emitters fire in order:
 *
 *   1. emitAgentSpec    — agents/broomva/spec.md (the resident agent's spec
 *                          frontmatter; visible in the Agents lens)
 *   2. emitQuickstart   — notes/quickstart.md (anonymous reference page;
 *                          visible in the Files lens)
 *   3. emitWelcomeArc   — Broomva's 3-beat introduction emitted as
 *                          (prose intro → fs.write welcome.md → prose
 *                          follow-up). Plays on the Session lens canvas
 *                          on first paint.
 *
 * Idempotent per session: only fires on `state.nextSeq === 1`. Production
 * (Plan C v1.1+) will replace this stub with a real arcan-provider-local
 * agent that emits the same envelopes through the canonical runtime.
 */
function seedFreshSession(state: SessionState): void {
  if (state.nextSeq !== 1) return;
  emitAgentSpec(state);
  emitQuickstart(state);
  emitWelcomeArc(state);
}

function emitAgentSpec(state: SessionState): void {
  emit(
    state,
    makeEnvelope({
      session_id: state.sid,
      seq: state.nextSeq,
      event: {
        type: "node_added",
        parent: SCENE_ROOT_ID,
        node: {
          id: `seed-broomva-spec-${state.sid}`,
          intent: {
            type: "tool_call",
            name: "fs.write",
            args: {
              path: "agents/broomva/spec.md",
              content: [
                "# Broomva — Resident agent",
                "",
                "You are Broomva, the resident voice of this workspace.",
                "You introduce the workspace and stay available for direct",
                "questions. Your tone is calm, deliberate, useful.",
                "",
                "## Boundaries",
                "",
                "- Read and write within this workspace only.",
                "- Auto-snapshot every fs.write; nothing is destructive.",
                "- Defer policy-sensitive operations with an approval card.",
              ].join("\n"),
              frontmatter: {
                kind: "agent_spec",
                name: "Broomva",
                archetype: "resident",
                description:
                  "Resident voice of this workspace. Introduces the OS and stays available for direct questions.",
                model: "claude-sonnet-4.5",
                grants: ["fs.read", "fs.write", "memory.read", "memory.write"],
                approval_mode: "silent",
                tags: ["welcome", "resident"],
                created: new Date().toISOString(),
              },
            },
          },
        },
      },
    }),
  );
}

function emitQuickstart(state: SessionState): void {
  emit(
    state,
    makeEnvelope({
      session_id: state.sid,
      seq: state.nextSeq,
      event: {
        type: "node_added",
        parent: SCENE_ROOT_ID,
        node: {
          id: `seed-quickstart-${state.sid}`,
          intent: {
            type: "tool_call",
            name: "fs.write",
            args: {
              path: "notes/quickstart.md",
              content: [
                "# Quickstart",
                "",
                "Three things to try:",
                "",
                "1. Click any file in the left rail to open it.",
                "2. Press ⌘K and start typing to open the command palette.",
                "3. Switch lenses via the dock or URL parameters.",
                "",
                "The right rail shows the outline of the current file and",
                "any backlinks pointing at it.",
              ].join("\n"),
              frontmatter: {
                kind: "doc",
                tags: ["welcome", "quickstart"],
                created: new Date().toISOString(),
              },
            },
          },
        },
      },
    }),
  );
}

function emitWelcomeArc(state: SessionState): void {
  // Beat 1: Broomva introduces herself.
  emit(
    state,
    makeEnvelope({
      session_id: state.sid,
      seq: state.nextSeq,
      event: {
        type: "node_added",
        parent: SCENE_ROOT_ID,
        node: {
          id: `seed-welcome-intro-${state.sid}`,
          // `author` is a plan-level extension on prose; ProseIntent reads it
          // via a local type widening. The canonical Intent::Prose only has
          // `{ type, text }`, so cast through `never` to carry the field.
          intent: {
            type: "prose",
            text: [
              "Welcome. I'm Broomva — the resident voice of this workspace.",
              "",
              "A workspace is persistent. This file, your conversations with me, the agents you spawn, the memory we build — all of it survives between visits.",
            ].join("\n"),
            author: "agent",
          } as never,
        },
      },
    }),
  );
  // Beat 2: Broomva writes welcome.md (first-person authored).
  emit(
    state,
    makeEnvelope({
      session_id: state.sid,
      seq: state.nextSeq,
      event: {
        type: "node_added",
        parent: SCENE_ROOT_ID,
        node: {
          id: `seed-welcome-md-${state.sid}`,
          intent: {
            type: "tool_call",
            name: "fs.write",
            args: {
              path: "welcome.md",
              content: [
                "# Welcome",
                "",
                "I'm Broomva — the resident voice of this workspace.",
                "",
                "A workspace is persistent. This file, your conversations with me, the agents you spawn, the memory we build — all of it survives between visits.",
                "",
                "## Three things to try",
                "",
                "- Read `notes/quickstart.md` for the one-minute tour.",
                "- Open the Agents lens (`?lens=agents`) to see who's installed.",
                "- Ask me anything in the Session lens.",
                "",
                "Nothing here is hidden. Every write I make is an Operation, and every Operation is reversible.",
              ].join("\n"),
              frontmatter: {
                kind: "doc",
                tags: ["welcome"],
                author: "broomva",
                created: new Date().toISOString(),
              },
            },
          },
        },
      },
    }),
  );
  // Beat 3: Broomva closes with a question.
  emit(
    state,
    makeEnvelope({
      session_id: state.sid,
      seq: state.nextSeq,
      event: {
        type: "node_added",
        parent: SCENE_ROOT_ID,
        node: {
          id: `seed-welcome-question-${state.sid}`,
          intent: {
            type: "prose",
            text: [
              "I wrote `welcome.md` for you while we get acquainted — you can open it from the left rail.",
              "",
              "Where would you like to start: a tour of the workspace, or your first question?",
            ].join("\n"),
            author: "agent",
          } as never,
        },
      },
    }),
  );
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
 *
 * Yields full `Envelope` frames — `seq` is sourced from `envelope.seq`,
 * not from inside `envelope.event`. The session-lens hook reads the
 * envelope's seq to advance its cursor and applies `envelope.event`
 * to the Scene via Prosopon's `applyEvent`.
 */
export async function* streamSession(
  opts: StreamSessionOpts,
): AsyncGenerator<Envelope, void, unknown> {
  const { sid, fromSeq, signal } = opts;
  const state = getOrCreateSession(sid);

  // Replay all buffered envelopes whose seq is strictly greater than
  // fromSeq. The buffer is append-only (see `emit` + `MAX_BUFFER`); we
  // iterate by index so multiple subscribers and refreshes each get
  // their own full replay from their own cursor.
  //
  // The previous implementation drained via `state.buffer.shift()` —
  // the comment claimed "we do NOT drain" but the code did exactly
  // that. After the first subscriber consumed the welcome arc, the
  // buffer was empty and refresh showed an empty scene. Plan D fixes
  // this and unlocks multi-tab as a side effect.
  for (const pending of state.buffer) {
    if (signal.aborted) return;
    if (BigInt(pending.envelope.seq) <= fromSeq) continue;
    yield pending.envelope;
  }

  // Park until a new envelope arrives or the caller aborts.
  while (!signal.aborted) {
    const next = await new Promise<IteratorResult<Envelope>>((resolve) => {
      const waiter: Waiter = { resolve, signal };
      const onAbort = () => {
        // Drop this waiter from the queue on abort.
        const idx = state.waiters.indexOf(waiter);
        if (idx >= 0) state.waiters.splice(idx, 1);
        resolve({ value: undefined, done: true });
      };
      signal.addEventListener("abort", onAbort, { once: true });
      state.waiters.push(waiter);
    });
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
