/**
 * InProcessAgentSessionClient — runs an agent turn inline in the
 * Next.js process, wrapping `RealAgentRunner`.
 *
 * This is the default `AgentSessionClient` impl; the factory picks
 * it when `LIFED_GATEWAY_URL` is unset. The lifed-ws client
 * (`./lifed-ws-client.ts`) is the alternative — same interface,
 * same event shape, different transport.
 *
 * Translates `RunnerYield` from `RealAgentRunner` (heterogenous mix
 * of AI-SDK stream parts + DomainEvents) into a uniform
 * `CanonicalAgentEvent` stream. Sequence numbers are assigned
 * synthetically per yielded event — InProcess has no replay log so
 * the `fromSequence` cursor is ignored.
 *
 * Spec: docs/superpowers/specs/2026-05-03-life-runtime-canonical.md
 */

import "server-only";
import type { AppModelId } from "@/lib/ai/app-model-id";
import type { LifeProject } from "@/lib/db/schema";
import type { KernelClient } from "../kernel";
import { createKernelClient } from "../kernel/factory";
import { type ToolHandler } from "../kernel/in-process-client";
import type { VmHandle } from "../kernel/types";
import {
  getProjectConfig,
  isProjectSlug,
  type ProjectConfig,
  type ProjectSlug,
} from "../projects";
import {
  makeLifeToolHandlers,
  RealAgentRunner,
  type RealRunnerOptions,
} from "../real-runner";
import type { ModuleTypeId } from "../types";
import {
  domainEventToCanonical,
  llmPartToCanonical,
} from "./event-translators";
import {
  type AgentEvent,
  type AgentSessionClient,
  type AgentSessionHealth,
  AgentSessionUnknownSidError,
  type AgentStreamInput,
  type CanonicalAgentEvent,
} from "./types";

// ---------------------------------------------------------------------------
// Helpers — bridge legacy types to canonical AgentEvent shape.
// (Implementations moved to `event-translators.ts` for testability.)
// ---------------------------------------------------------------------------

// (Translation helpers `domainEventToCanonical` + `llmPartToCanonical`
// live in `./event-translators.ts` — pure module, importable from
// vitest without dragging the AI SDK + DB env validation chain.)

// ---------------------------------------------------------------------------
// Multi-turn queue plumbing
// ---------------------------------------------------------------------------

/**
 * Sentinel resolved into the queue when the multi-turn loop must exit
 * (abort signal fires, fatal error, generator dropped). The queue
 * resolver receives either a string (the next user message) or this
 * symbol.
 */
const QUEUE_CLOSED = Symbol("QUEUE_CLOSED");

/**
 * One parked waiter awaiting the next user message. Mirrors the
 * `session-runtime.ts` waiter pattern — see Plan D's replay buffer.
 *
 * The `resolve` function fires exactly once. When the producer
 * (`sendMessage`) lands a message before any consumer parks, the
 * message is appended as a `pending` entry instead; the next
 * `nextFromQueue` call drains it immediately.
 */
type TurnQueueEntry =
  | { kind: "waiter"; resolve: (v: string | typeof QUEUE_CLOSED) => void }
  | { kind: "pending"; content: string };

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export interface InProcessAgentSessionClientDeps {
  /**
   * Minimal `LifeProject` row factory — accepts the project slug and
   * returns the DB-shaped row used by `RealAgentRunner`. The runtime
   * supplies this from `resolveProjectBySlug`. Tests provide a fake.
   */
  resolveProject(slug: string): Promise<LifeProject>;
  /**
   * Per-run kernel client. Defaults to `createKernelClient({ tools })`.
   * Tests override to inject a deterministic kernel.
   */
  kernelClientFactory?: (deps: {
    tools: Record<string, ToolHandler>;
  }) => KernelClient;
}

const DEFAULT_KERNEL_FACTORY = (deps: {
  tools: Record<string, ToolHandler>;
}): KernelClient => createKernelClient({ tools: deps.tools });

/**
 * In-process `AgentSessionClient` — runs `RealAgentRunner` and emits
 * canonical events. Default backend until `LIFED_GATEWAY_URL` is set.
 */
export class InProcessAgentSessionClient implements AgentSessionClient {
  readonly backendId = "in-process" as const;
  private readonly resolveProject: InProcessAgentSessionClientDeps["resolveProject"];
  private readonly kernelClientFactory: NonNullable<
    InProcessAgentSessionClientDeps["kernelClientFactory"]
  >;
  /**
   * Per-sid multi-turn queue. Populated when `stream(input)` is called
   * with `input.multiTurn === true`; removed when that stream exits.
   *
   * Entry semantics:
   *   - On `sendMessage(sid, content)`: if the head entry is a `waiter`,
   *     shift + resolve it. Otherwise push a `pending` entry.
   *   - On `nextFromQueue(sid)`: if the head entry is `pending`, shift +
   *     return its content. Otherwise push a `waiter` and await.
   *
   * This single-array design avoids two separate "waiters" + "pending"
   * arrays staying in lockstep. Only one shape is ever in the array at
   * a time — `waiter` while no producer has landed; `pending` while no
   * consumer is parked. The contract guarantees a producer-or-consumer
   * race resolves correctly without dropping messages.
   */
  private readonly turnQueues = new Map<string, TurnQueueEntry[]>();

  constructor(deps: InProcessAgentSessionClientDeps) {
    this.resolveProject = deps.resolveProject;
    this.kernelClientFactory =
      deps.kernelClientFactory ?? DEFAULT_KERNEL_FACTORY;
  }

  async health(): Promise<AgentSessionHealth> {
    return {
      backendId: this.backendId,
      reachable: true,
      detail: "agent loop runs inline in this Next.js process",
    };
  }

  /**
   * Push a new user message into an active multi-turn stream. Resolves
   * once the message is queued (not once the turn completes).
   *
   * Throws `AgentSessionUnknownSidError` when no multi-turn stream is
   * registered for the given `sessionId` — either the stream never
   * opened in multi-turn mode (per-turn streams don't register a
   * queue), or it already terminated and cleaned up.
   */
  async sendMessage(sessionId: string, content: string): Promise<void> {
    const entries = this.turnQueues.get(sessionId);
    if (!entries) throw new AgentSessionUnknownSidError(sessionId);
    const head = entries[0];
    if (head && head.kind === "waiter") {
      entries.shift();
      head.resolve(content);
      return;
    }
    // No consumer parked — buffer for the next `nextFromQueue` call.
    entries.push({ kind: "pending", content });
  }

  async *stream(input: AgentStreamInput): AsyncIterable<CanonicalAgentEvent> {
    if (!isProjectSlug(input.projectSlug)) {
      yield this.canonical(0n, {
        kind: "error",
        code: "in-process.unknown_project",
        message: `Unknown project slug "${input.projectSlug}"`,
      });
      yield this.canonical(1n, {
        kind: "finish",
        reason: "error",
      });
      return;
    }
    const cfg = getProjectConfig(input.projectSlug);
    const project = await this.resolveProject(input.projectSlug);

    const tools = makeLifeToolHandlers(project);
    const kernelClient = this.kernelClientFactory({ tools });

    const vm: VmHandle =
      input.vm ??
      (await kernelClient.createVm(
        {
          backendHint: kernelClient.backendId,
          toolAllowlist: cfg.toolAllowlist,
          metadataJson: JSON.stringify({
            projectSlug: cfg.slug,
            moduleTypeId: cfg.moduleTypeId,
          }),
        },
        input.kernelCtx,
      ));

    let seq = 0n;
    const emit = (e: AgentEvent): CanonicalAgentEvent =>
      this.canonical(seq++, e);

    yield emit({ kind: "open", sessionId: input.sessionId, vmHandle: vm });

    // Branch on multi-turn opt-in. The per-turn path stays bit-for-bit
    // identical to today (E-2 invariant: zero behavior change for
    // canonical.ts:254). The multi-turn path replaces the single
    // runner.run() with an outer queue-pumping loop.
    if (input.multiTurn === true) {
      yield* this.streamMultiTurn(input, project, cfg, kernelClient, vm, {
        emitNext: emit,
      });
      return;
    }

    const runnerOpts: RealRunnerOptions = {
      project,
      moduleTypeId: cfg.moduleTypeId as ModuleTypeId,
      projectSlug: cfg.slug,
      input: input.userMessage,
      maxCostCents: maxCostCentsFor(cfg),
      onFinish: undefined,
      history: input.history,
      userMessage: input.userMessage,
      paymentMode: paymentModeFor(cfg),
      kernelClient,
      vm,
      kernelCtx: input.kernelCtx,
      turnId: `inproc-${input.sessionId}-${Date.now().toString(36)}`,
      lifeSessionId: input.sessionId,
    };

    const runner = new RealAgentRunner(runnerOpts);

    // State for thinking_start/end pairing — emit `thinking_end` when
    // a non-reasoning yield arrives after a reasoning streak.
    let inReasoning = false;
    const reasoningStartedAt = { ms: 0 };

    try {
      for await (const y of runner.run()) {
        if (input.signal?.aborted) {
          yield emit({
            kind: "warning",
            code: "in-process.aborted",
            message: "stream aborted by client",
          });
          break;
        }

        if (y.kind === "llm") {
          const events = llmPartToCanonical(y.part);
          for (const ev of events) {
            if (ev.kind === "thinking_start") {
              if (!inReasoning) {
                inReasoning = true;
                reasoningStartedAt.ms = Date.now();
                yield emit(ev);
              }
              continue;
            }
            if (inReasoning) {
              inReasoning = false;
              yield emit({
                kind: "thinking_end",
                ms: Date.now() - reasoningStartedAt.ms,
              });
            }
            yield emit(ev);
          }
        } else if (y.kind === "domain") {
          if (inReasoning) {
            inReasoning = false;
            yield emit({
              kind: "thinking_end",
              ms: Date.now() - reasoningStartedAt.ms,
            });
          }
          for (const ev of domainEventToCanonical(y.event)) {
            yield emit(ev);
          }
        }
      }
    } finally {
      // `finish` is emitted from the runner's `done` DomainEvent
      // translation; if the runner threw before that, ensure we close
      // the stream with a synthetic finish so consumers don't hang.
      // The cheap idempotency check: track whether any finish/error
      // already went out by inspecting whether emit() was called more
      // than once after the open frame. The current loop guarantees
      // at most one `finish` from the runner — so if seq is < 2 we
      // never produced one and need to synthesize.
      if (seq < 2n) {
        yield emit({
          kind: "finish",
          reason: "incomplete",
        });
      }
      // Best-effort cleanup. InProcess kernel destroy is a no-op.
      try {
        await kernelClient.destroy(vm);
      } catch {
        // swallow — destroy must not break the stream
      }
    }
  }

  /**
   * Multi-turn body. Splits out from `stream()` so the per-turn path
   * stays a flat read-from-top branch.
   *
   * Loop shape:
   *   1. Register a queue for this sid so `sendMessage` can land
   *      messages.
   *   2. Outer loop:
   *      - First iteration: use `input.userMessage` directly.
   *      - Subsequent: park on the queue until the next message arrives
   *        (or the signal aborts).
   *      - Run one `RealAgentRunner` per turn against the accumulated
   *        history; yield events through the existing translation.
   *      - Append `{ role: "user", content: userMessage }` and the
   *        assistant text (gathered from token events) to history.
   *      - DO NOT emit `finish` between turns — only emit one terminal
   *        `finish` when the loop exits.
   *   3. Finally: emit exactly one terminal `finish`, drain any parked
   *      waiters, destroy VM.
   */
  private async *streamMultiTurn(
    input: AgentStreamInput,
    project: LifeProject,
    cfg: ProjectConfig,
    kernelClient: KernelClient,
    vm: VmHandle,
    plumb: { emitNext: (e: AgentEvent) => CanonicalAgentEvent },
  ): AsyncIterable<CanonicalAgentEvent> {
    const { emitNext } = plumb;
    const sid = input.sessionId;
    this.turnQueues.set(sid, []);

    // Per-iteration accumulated history. Starts as a copy of the
    // caller-provided rehydrated history; each turn appends one
    // {user, assistant} pair.
    const history: Array<{ role: "user" | "assistant"; content: string }> =
      input.history.map((h) => ({ role: h.role, content: h.content }));

    let userMessage = input.userMessage;
    let firstTurn = true;
    let exitReason: "stop" | "aborted" | "error" = "stop";
    let exitError: { code: string; message: string } | null = null;

    try {
      // Outer loop — one iteration per user turn.
      while (true) {
        if (input.signal?.aborted) {
          exitReason = "aborted";
          break;
        }

        if (!firstTurn) {
          // Park until the next user message lands, or the signal
          // aborts. Returns QUEUE_CLOSED if the abort/finalisation
          // fired first.
          const next = await this.nextFromQueue(sid, input.signal);
          if (next === QUEUE_CLOSED) {
            // Either the signal aborted or the iterator was dropped;
            // either way, exit cleanly.
            exitReason = input.signal?.aborted ? "aborted" : "stop";
            break;
          }
          userMessage = next;
        }
        firstTurn = false;

        const runnerOpts: RealRunnerOptions = {
          project,
          moduleTypeId: cfg.moduleTypeId as ModuleTypeId,
          projectSlug: cfg.slug,
          input: userMessage,
          maxCostCents: maxCostCentsFor(cfg),
          onFinish: undefined,
          // Pass the accumulated history; each turn sees prior turns'
          // assistant outputs as context.
          history,
          userMessage,
          paymentMode: paymentModeFor(cfg),
          kernelClient,
          vm,
          kernelCtx: input.kernelCtx,
          turnId: `inproc-mt-${sid}-${Date.now().toString(36)}`,
          lifeSessionId: sid,
        };

        const runner = new RealAgentRunner(runnerOpts);

        // Per-turn thinking pair state — resets each turn so a stale
        // reasoning streak from turn N doesn't bleed into turn N+1.
        let inReasoning = false;
        const reasoningStartedAt = { ms: 0 };

        // Capture assistant text from token events so we can append it
        // to `history` for the next turn's runner.
        let assistantText = "";

        // The runner emits exactly one `finish` event per call (via
        // its `done` DomainEvent). In multi-turn mode we swallow that
        // per-turn finish so the iterable stays alive — the consumer
        // only sees a terminal `finish` when the OUTER loop exits.
        let perTurnFinishSeen = false;

        try {
          for await (const y of runner.run()) {
            if (input.signal?.aborted) {
              exitReason = "aborted";
              break;
            }

            if (y.kind === "llm") {
              const events = llmPartToCanonical(y.part);
              for (const ev of events) {
                if (ev.kind === "thinking_start") {
                  if (!inReasoning) {
                    inReasoning = true;
                    reasoningStartedAt.ms = Date.now();
                    yield emitNext(ev);
                  }
                  continue;
                }
                if (inReasoning) {
                  inReasoning = false;
                  yield emitNext({
                    kind: "thinking_end",
                    ms: Date.now() - reasoningStartedAt.ms,
                  });
                }
                if (ev.kind === "token") {
                  assistantText += ev.delta;
                }
                yield emitNext(ev);
              }
            } else if (y.kind === "domain") {
              if (inReasoning) {
                inReasoning = false;
                yield emitNext({
                  kind: "thinking_end",
                  ms: Date.now() - reasoningStartedAt.ms,
                });
              }
              for (const ev of domainEventToCanonical(y.event)) {
                if (ev.kind === "finish") {
                  perTurnFinishSeen = true;
                  // Swallow — terminal finish lives in the outer
                  // `finally`. The per-turn finish from the runner
                  // marks a turn boundary; we don't surface it to
                  // the consumer in multi-turn mode (the contract is
                  // "exactly one terminal finish per stream()").
                  continue;
                }
                if (ev.kind === "error") {
                  // A turn-level error promotes to a stream-level
                  // error. Capture it for the terminal finish.
                  exitReason = "error";
                  exitError = { code: ev.code, message: ev.message };
                  yield emitNext(ev);
                  continue;
                }
                yield emitNext(ev);
              }
            }
          }
        } catch (err) {
          // Runner threw — surface as a stream-level error and exit
          // the outer loop.
          const e = err as Error;
          exitReason = "error";
          exitError = {
            code: "in-process.runner_failed",
            message: e.message ?? "runner threw",
          };
          yield emitNext({
            kind: "error",
            code: exitError.code,
            message: exitError.message,
          });
        }

        // Append this turn to history for the next iteration's runner.
        history.push({ role: "user", content: userMessage });
        if (assistantText.length > 0) {
          history.push({ role: "assistant", content: assistantText });
        }

        // Belt-and-suspenders: if the runner didn't emit a per-turn
        // finish, log a warning so operators see the anomaly. Doesn't
        // affect correctness.
        if (!perTurnFinishSeen && exitReason === "stop") {
          // No-op for now — the multi-turn contract doesn't require
          // a per-turn finish; we just expect one for parity with the
          // single-turn path. Future telemetry could surface this.
        }

        if (exitReason === "error" || exitReason === "aborted") {
          break;
        }
        // Loop and wait for the next message.
      }
    } finally {
      // Drain any parked waiters so they don't hang forever.
      const parked = this.turnQueues.get(sid);
      this.turnQueues.delete(sid);
      if (parked) {
        for (const entry of parked) {
          if (entry.kind === "waiter") {
            entry.resolve(QUEUE_CLOSED);
          }
        }
      }
      // Emit exactly one terminal finish.
      yield emitNext({
        kind: "finish",
        reason:
          exitReason === "error"
            ? (exitError?.code ?? "error")
            : exitReason === "aborted"
              ? "aborted"
              : "stop",
      });
      try {
        await kernelClient.destroy(vm);
      } catch {
        // swallow — destroy must not break the stream
      }
    }
  }

  /**
   * Park until the next user message arrives, or the abort signal
   * fires (whichever comes first). Returns the message content on
   * success, or `QUEUE_CLOSED` on abort / iterator-dropped.
   *
   * Drains any pre-queued `pending` entry immediately — `sendMessage`
   * appends `pending` when no consumer is parked.
   */
  private nextFromQueue(
    sid: string,
    signal?: AbortSignal,
  ): Promise<string | typeof QUEUE_CLOSED> {
    const entries = this.turnQueues.get(sid);
    if (!entries) return Promise.resolve(QUEUE_CLOSED);
    const head = entries[0];
    if (head && head.kind === "pending") {
      entries.shift();
      return Promise.resolve(head.content);
    }
    return new Promise<string | typeof QUEUE_CLOSED>((resolve) => {
      if (signal?.aborted) {
        resolve(QUEUE_CLOSED);
        return;
      }
      const onAbort = () => {
        // Remove the waiter from the queue (if still queued) and
        // resolve as closed.
        const list = this.turnQueues.get(sid);
        if (list) {
          const idx = list.indexOf(waiter);
          if (idx >= 0) list.splice(idx, 1);
        }
        resolve(QUEUE_CLOSED);
      };
      const waiter: TurnQueueEntry = {
        kind: "waiter",
        resolve: (v) => {
          signal?.removeEventListener("abort", onAbort);
          resolve(v);
        },
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      entries.push(waiter);
    });
  }

  private canonical(seq: bigint, event: AgentEvent): CanonicalAgentEvent {
    return {
      seq,
      at: new Date().toISOString(),
      event,
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function paymentModeFor(cfg: ProjectConfig): string {
  switch (cfg.billing.mode) {
    case "free":
      return "free";
    case "credits":
      return "credits";
    case "x402":
      return "haima_balance";
  }
}

function maxCostCentsFor(cfg: ProjectConfig): number {
  switch (cfg.billing.mode) {
    case "free":
      return 5; // dev-grade default cap
    case "credits":
    case "x402":
      return cfg.billing.pricePerRunCents;
  }
}

// Re-export for tests so they can construct a model id without
// re-importing the AppModelId type.
export type _InternalModelId = AppModelId;
export type _InternalProjectSlug = ProjectSlug;

// ---------------------------------------------------------------------------
// Test-only exports — keep the translation helpers reachable without
// taking a hard dep on a stubbed RealAgentRunner.
// ---------------------------------------------------------------------------

export const _internals = {
  domainEventToCanonical,
  llmPartToCanonical,
  paymentModeFor,
  maxCostCentsFor,
};
