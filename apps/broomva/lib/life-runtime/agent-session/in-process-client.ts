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
  makeLifeToolHandlers,
  RealAgentRunner,
  type RealRunnerOptions,
} from "../real-runner";
import {
  getProjectConfig,
  isProjectSlug,
  type ProjectConfig,
  type ProjectSlug,
} from "../projects";
import type { ModuleTypeId } from "../types";
import {
  domainEventToCanonical,
  llmPartToCanonical,
} from "./event-translators";
import type {
  AgentEvent,
  AgentSessionClient,
  AgentSessionHealth,
  AgentStreamInput,
  CanonicalAgentEvent,
} from "./types";

// ---------------------------------------------------------------------------
// Helpers — bridge legacy types to canonical AgentEvent shape.
// (Implementations moved to `event-translators.ts` for testability.)
// ---------------------------------------------------------------------------

// (Translation helpers `domainEventToCanonical` + `llmPartToCanonical`
// live in `./event-translators.ts` — pure module, importable from
// vitest without dragging the AI SDK + DB env validation chain.)

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
}): KernelClient =>
  createKernelClient({ tools: deps.tools });

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

  async *stream(
    input: AgentStreamInput,
  ): AsyncIterable<CanonicalAgentEvent> {
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
    const emit = (e: AgentEvent): CanonicalAgentEvent => this.canonical(seq++, e);

    yield emit({ kind: "open", sessionId: input.sessionId, vmHandle: vm });

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
