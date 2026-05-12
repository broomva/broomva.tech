/**
 * Canonical Life Runtime — orchestrates one agent turn end-to-end on
 * the broomva.tech `/life` surface.
 *
 * Replaces the procedural orchestration that used to live inline in
 * `app/api/life/run/[project]/prosopon/route.ts`. The route becomes
 * a thin parse-auth-delegate handler; the runtime owns:
 *
 *   - Project resolution (registry → DB lazy-upsert).
 *   - Billing decision (free / credits / x402).
 *   - Session + run row creation.
 *   - Chat-history rehydration.
 *   - AgentSessionClient delegation (in-process or lifed-ws via the
 *     factory; same canonical event stream either way).
 *   - Prosopon envelope emission + LifeRunEvent persistence.
 *   - Terminal `finishRun` + settlement + stats bump.
 *
 * Spec: docs/superpowers/specs/2026-05-03-life-runtime-canonical.md
 */

import "server-only";
import {
  type Envelope,
  makeEnvelope,
  type ProsoponEvent,
} from "@broomva/prosopon";
import {
  createAgentSessionClient,
  type AgentSessionClient,
  type CanonicalAgentEvent,
  type TierUserCap,
} from "./agent-session";
import {
  pickPaymentMode,
  settleCreditsDebit,
} from "./billing";
import type { KernelContext } from "./kernel";
import {
  ProsoponEmitter,
  SCENE_ROOT_ID,
} from "./prosopon-emitter";
import {
  appendRunEvent,
  bumpProjectStats,
  createRun,
  finishRun,
  getOrCreateSession,
  getSessionHistory,
  setLifeSessionKernelVmHandle,
} from "./queries";
import { resolveProjectBySlug } from "./db-seed";
import { isProjectSlug, type ProjectSlug } from "./projects";
import type { ConsumerIdentity, RunnerYield } from "./types";

// ---------------------------------------------------------------------------
// Inputs / outputs
// ---------------------------------------------------------------------------

export interface RunInput {
  /** URL slug; will be validated against the canonical registry. */
  projectSlug: string;
  /** Logged-in user / anonymous session / agent. */
  consumer: ConsumerIdentity;
  /** User message for this turn. Empty/missing rejected upstream — runtime expects a non-empty string. */
  userMessage: string;
  /** Existing LifeSession.id if continuing a thread. */
  sessionIdHint?: string;
  /** Free-form input metadata; persisted on the run row. */
  input?: unknown;
  /** Caller's BYOK key id (for cost attribution). */
  byokKeyId?: string;
  /** Tier-User capability JWT — required when the lifed-ws backend is active. */
  capability?: TierUserCap;
}

export type RunOutcome =
  | { kind: "envelopes"; stream: AsyncIterable<Envelope> }
  | {
      kind: "payment_required";
      quote: NonNullable<
        ReturnType<typeof pickPaymentMode>["paymentQuote"]
      >;
      retryWithHeader: "X-PAYMENT";
      projectSlug: ProjectSlug;
    }
  | {
      kind: "rejected";
      reason:
        | "unknown_project"
        | "insufficient_credits"
        | "internal";
      message: string;
      meta?: Record<string, unknown>;
    };

export interface LifeRuntimeDeps {
  /** Agent session client. Defaults to the env-driven factory. */
  agentSessionClient?: AgentSessionClient;
  /**
   * For tests: skip DB writes (createRun / appendRunEvent / finishRun /
   * bumpProjectStats / settleCreditsDebit). The runtime still emits
   * envelopes correctly; just doesn't touch Postgres.
   */
  skipPersistence?: boolean;
  /**
   * Hook fired after the runtime decides on a backend. Used by tests +
   * the health endpoint to surface the active client.
   */
  onBackendDecision?: (backendId: string) => void;
}

// ---------------------------------------------------------------------------
// LifeRuntime
// ---------------------------------------------------------------------------

export interface LifeRuntime {
  /**
   * Validate, decide billing, kick off an agent turn, and yield
   * Prosopon envelopes. Side effects (DB persistence, settlement,
   * stats) happen along the way.
   */
  run(input: RunInput): Promise<RunOutcome>;
  /**
   * Cheap health probe — proxies to the active AgentSessionClient.
   */
  health(): Promise<{ backendId: string; reachable: boolean; detail?: string }>;
}

export function createLifeRuntime(deps: LifeRuntimeDeps = {}): LifeRuntime {
  const sessionClient = deps.agentSessionClient ?? createAgentSessionClient();
  deps.onBackendDecision?.(sessionClient.backendId);

  return {
    health: () => sessionClient.health(),
    async run(input: RunInput): Promise<RunOutcome> {
      // 1. Validate slug + load project.
      if (!isProjectSlug(input.projectSlug)) {
        return {
          kind: "rejected",
          reason: "unknown_project",
          message: `unknown project slug "${input.projectSlug}"`,
        };
      }
      const project = await resolveProjectBySlug(input.projectSlug);
      if (!project) {
        return {
          kind: "rejected",
          reason: "unknown_project",
          message: `project "${input.projectSlug}" not in registry or DB`,
        };
      }

      // 2. Billing decision.
      const decision = pickPaymentMode({
        project,
        consumer: input.consumer,
        byokKeyId: input.byokKeyId,
      });
      if (decision.mode === "x402") {
        return {
          kind: "payment_required",
          quote: decision.paymentQuote!,
          retryWithHeader: "X-PAYMENT",
          projectSlug: input.projectSlug,
        };
      }

      // 3. LifeSession + run row.
      const lifeSession = await getOrCreateSession({
        projectId: project.id,
        sessionId: input.sessionIdHint,
        consumerKind: input.consumer.kind,
        consumerId: input.consumer.id,
        organizationId: input.consumer.organizationId,
      });
      const history = await getSessionHistory(lifeSession.id);
      const run = await createRun({
        projectId: project.id,
        rulesVersionId: null,
        sessionId: lifeSession.id,
        inputText: input.userMessage,
        consumerKind: input.consumer.kind,
        consumerId: input.consumer.id,
        organizationId: input.consumer.organizationId,
        input: input.input,
        paymentMode: decision.mode,
      });

      const kernelCtx: KernelContext = {
        sessionId: lifeSession.id,
        agentId:
          input.consumer.kind === "agent"
            ? input.consumer.id
            : `user:${input.consumer.id}`,
      };

      // 3.5. Stage 3a (May 2026): for the lifed-ws backend, the WS
      // upgrade lands on `Agent.StreamSession` which requires the sid
      // to already exist in lifed's routing cache. The cache populates
      // only after a successful `Agent.CreateSession`. lifed's
      // routing-cache idle-eviction is 1h (configurable) so within a
      // chat we'd ideally reuse the lifed sid — but persisting it is
      // a separate concern (Stage 3a-bis); for now we mint a fresh
      // lifed session per turn. The CreateSession saga is cheap
      // against mock substrates (~1 ms) and well within budget against
      // real ones (~100 ms).
      //
      // The InProcess backend is a no-op for this step — it doesn't
      // route through lifegw and ignores the lifed sid.
      let wsSid: string = lifeSession.id;
      if (
        sessionClient.backendId === "lifed-ws" &&
        input.capability &&
        typeof (
          sessionClient as unknown as {
            createSession?: (
              x: unknown,
            ) => Promise<{ sid: string }>;
          }
        ).createSession === "function"
      ) {
        const createSessionFn = (
          sessionClient as unknown as {
            createSession: (x: {
              capability: { token: string };
              userId: string;
              projectSlug: string;
              label?: string;
            }) => Promise<{ sid: string }>;
          }
        ).createSession;
        try {
          const created = await createSessionFn({
            capability: input.capability,
            userId: input.consumer.id,
            projectSlug: input.projectSlug,
            label: lifeSession.id, // human-debuggable cross-ref
          });
          wsSid = created.sid;
        } catch (err) {
          // Surface the failure as a typed envelope rather than a 500
          // — the route handler emits this through the SSE stream so
          // the client can react. Falling back to the broomva-side
          // `lifeSession.id` would just reproduce the boot-race
          // "internal_error" we're trying to fix; better to fail loud.
          const e = err as Error;
          throw new Error(
            `Failed to create lifed session before WS upgrade: ${e.message}`,
          );
        }
      }

      // 4. Build the canonical event stream from the agent-session client.
      const canonicalStream = sessionClient.stream({
        sessionId: wsSid,
        agentId: kernelCtx.agentId,
        projectSlug: input.projectSlug,
        userMessage: input.userMessage,
        history: history.map((h) => ({
          role: h.role as "user" | "assistant",
          content: h.content,
        })),
        kernelCtx,
        capability: input.capability,
      });

      // 5. Pump → envelopes with side effects.
      const emitter = new ProsoponEmitter({
        sessionId: lifeSession.id,
        projectSlug: input.projectSlug,
        displayName: project.displayName,
        paymentMode: decision.mode,
        priorCostCents: 0,
        kernelBackendId: sessionClient.backendId,
      });

      const stream = pumpEnvelopes({
        sessionId: lifeSession.id,
        runId: run.id,
        userMessage: input.userMessage,
        emitter,
        canonicalStream,
        skipPersistence: deps.skipPersistence ?? false,
        onFinish: async ({ assistantText, costCents, model, provider }) => {
          if (deps.skipPersistence) return;
          await finishRun({
            runId: run.id,
            status: "succeeded",
            output: assistantText ? { text: assistantText } : undefined,
            llmCostCents: costCents,
            consumerPaidCents: decision.quotedCents,
            model,
            provider,
          });
          if (decision.mode === "credits" && input.consumer.kind === "user") {
            await settleCreditsDebit({
              userId: input.consumer.id,
              mode: decision.mode,
              amountCents: decision.quotedCents,
            });
          }
          try {
            await bumpProjectStats(project.id, costCents);
          } catch (err) {
            console.warn(
              "[LifeRuntime] bumpProjectStats failed (non-fatal):",
              err,
            );
          }
        },
        onError: async (err) => {
          if (deps.skipPersistence) return;
          await finishRun({
            runId: run.id,
            status: "failed",
            errorReason: err.message,
          });
        },
        onVmHandle: async (vm) => {
          if (deps.skipPersistence) return;
          try {
            await setLifeSessionKernelVmHandle({
              lifeSessionId: lifeSession.id,
              vmHandle: vm,
            });
          } catch (err) {
            console.warn(
              "[LifeRuntime] setLifeSessionKernelVmHandle failed (non-fatal):",
              err,
            );
          }
        },
      });

      return { kind: "envelopes", stream };
    },
  };
}

// ---------------------------------------------------------------------------
// Internal — translates CanonicalAgentEvent stream into Envelopes
// while recording side effects.
// ---------------------------------------------------------------------------

interface PumpArgs {
  sessionId: string;
  runId: string;
  userMessage: string;
  emitter: ProsoponEmitter;
  canonicalStream: AsyncIterable<CanonicalAgentEvent>;
  skipPersistence: boolean;
  onFinish: (args: {
    assistantText: string;
    costCents: number;
    model?: string;
    provider?: string;
  }) => Promise<void>;
  onError: (err: Error) => Promise<void>;
  onVmHandle: (vm: import("./kernel/types").VmHandle) => Promise<void>;
}

async function* pumpEnvelopes(
  args: PumpArgs,
): AsyncGenerator<Envelope, void, unknown> {
  let frameSeq = 0;
  let assistantText = "";
  let finalCostCents = 0;
  let model: string | undefined;
  let provider: string | undefined;
  let didError = false;

  const persist = async (env: Envelope, kind: string) => {
    if (args.skipPersistence) return;
    try {
      await appendRunEvent(args.runId, frameSeq, kind, {
        envelope: env as unknown as Record<string, unknown>,
      });
    } catch (err) {
      console.warn(
        "[LifeRuntime] appendRunEvent failed (non-fatal):",
        err,
      );
    }
  };

  try {
    // Initial scene + user-turn-started.
    for (const env of args.emitter.runStarted()) {
      await persist(env, env.event.type);
      frameSeq++;
      yield env;
    }
    const userEnv = args.emitter.userTurnStarted({
      text: args.userMessage,
      turnId: args.runId,
    });
    await persist(userEnv, userEnv.event.type);
    frameSeq++;
    yield userEnv;

    // Drive the canonical stream.
    for await (const ev of args.canonicalStream) {
      // Side-effect: capture VM handle from the open event.
      if (ev.event.kind === "open") {
        try {
          await args.onVmHandle(ev.event.vmHandle);
        } catch (err) {
          console.warn("[LifeRuntime] onVmHandle threw:", err);
        }
        continue;
      }
      if (ev.event.kind === "token") {
        assistantText += ev.event.delta;
      }
      if (ev.event.kind === "finish") {
        if (ev.event.usage) {
          finalCostCents = ev.event.usage.costCents ?? 0;
        }
        // The emitter doesn't have a native finish event for the
        // canonical kind; we synthesize a heartbeat envelope so the
        // browser flushes any pending UI timers. The DB-side onFinish
        // hook records the run-level completion.
        const hb = args.emitter.heartbeat();
        await persist(hb, hb.event.type);
        frameSeq++;
        yield hb;
        continue;
      }
      if (ev.event.kind === "error") {
        didError = true;
        for (const env of synthesizeErrorEnvelopes(args.sessionId, frameSeq, ev.event.message)) {
          await persist(env, env.event.type);
          frameSeq++;
          yield env;
        }
        continue;
      }

      // For events with a direct RunnerYield mapping, route through
      // the existing emitter so the prosopon envelope shape is
      // unchanged from the legacy path.
      const yields = canonicalToRunnerYield(ev);
      for (const ry of yields) {
        for (const env of args.emitter.translate(ry)) {
          await persist(env, env.event.type);
          frameSeq++;
          yield env;
        }
      }
    }

    if (didError) {
      await args.onError(new Error("agent-session error event"));
    } else {
      await args.onFinish({
        assistantText,
        costCents: finalCostCents,
        model,
        provider,
      });
    }
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    for (const env of synthesizeErrorEnvelopes(args.sessionId, frameSeq, e.message)) {
      await persist(env, env.event.type);
      frameSeq++;
      yield env;
    }
    await args.onError(e);
  }
}

/**
 * Translate canonical events back into RunnerYield shape so the
 * existing ProsoponEmitter (which understands AI-SDK parts +
 * DomainEvents) handles the rendering. Lossy by design — events
 * without a clean RunnerYield mapping (`open`, `finish`, `error`,
 * pure `warning`s) are handled separately above.
 */
function canonicalToRunnerYield(ev: CanonicalAgentEvent): RunnerYield[] {
  const at = ev.at;
  switch (ev.event.kind) {
    case "text_start":
      return [
        {
          kind: "llm",
          part: { type: "text-start", id: ev.event.messageId } as never,
          at,
        },
      ];
    case "token":
      return [
        {
          kind: "llm",
          part: {
            type: "text-delta",
            text: ev.event.delta,
            id: ev.event.messageId,
          } as never,
          at,
        },
      ];
    case "text_end":
      return [
        {
          kind: "llm",
          part: { type: "text-end", id: ev.event.messageId } as never,
          at,
        },
      ];
    case "tool_call_pending":
      return [
        {
          kind: "llm",
          part: {
            type: "tool-call",
            toolCallId: ev.event.call.callId,
            toolName: ev.event.call.toolName,
            input: safeParse(ev.event.call.inputJson),
          } as never,
          at,
        },
      ];
    case "tool_result": {
      const r = ev.event.result;
      const out = safeParse(r.outputJson);
      if (r.isError) {
        return [
          {
            kind: "llm",
            part: {
              type: "tool-error",
              toolCallId: r.callId,
              toolName: r.toolName,
              error: { message: extractErr(out) },
            } as never,
            at,
          },
        ];
      }
      return [
        {
          kind: "llm",
          part: {
            type: "tool-result",
            toolCallId: r.callId,
            toolName: r.toolName,
            output: out,
          } as never,
          at,
        },
      ];
    }
    case "thinking_start":
      return [
        {
          kind: "llm",
          part: { type: "reasoning-delta" } as never,
          at,
        },
      ];
    case "thinking_end":
      return [];
    case "fs_op":
      return [
        {
          kind: "domain",
          event: {
            type: "fs_op",
            payload: {
              path: ev.event.path,
              op: ev.event.op === "read" ? "read" : "create",
              bytes: ev.event.bytes,
            },
            at,
          },
        },
      ];
    case "nous_score":
      return [
        {
          kind: "domain",
          event: {
            type: "nous_score",
            payload: {
              score: ev.event.score,
              band: ev.event.score >= 0.75 ? "good" : "warn",
              note: ev.event.rationale ?? `${ev.event.dim} = ${ev.event.score}`,
            },
            at,
          },
        },
      ];
    case "autonomic":
      return [
        {
          kind: "domain",
          event: {
            type: "autonomic_event",
            payload: {
              pillar: ev.event.pillar,
              text: ev.event.note,
            },
            at,
          },
        },
      ];
    case "haima_billed":
    case "vigil_span":
    case "warning":
    case "approval_required":
      // Not currently surfaced by the legacy emitter; intentional drop.
      return [];
    case "open":
    case "finish":
    case "error":
      // Handled in the pump above.
      return [];
  }
}

function synthesizeErrorEnvelopes(
  sessionId: string,
  startSeq: number,
  message: string,
): Envelope[] {
  return [
    makeEnvelope({
      session_id: sessionId,
      seq: startSeq + 1,
      event: {
        type: "node_added",
        parent: SCENE_ROOT_ID,
        node: {
          id: `err-${Date.now().toString(36)}`,
          intent: {
            type: "confirm",
            message,
            severity: "danger",
          },
          children: [],
          bindings: [],
          actions: [],
          attrs: {},
          lifecycle: { created_at: new Date().toISOString() },
        },
      } as ProsoponEvent,
    }),
  ];
}

function safeParse(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function extractErr(parsed: unknown): string {
  if (parsed && typeof parsed === "object" && "error" in parsed) {
    return String((parsed as { error: unknown }).error);
  }
  return "tool dispatch failed";
}
