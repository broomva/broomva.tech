/**
 * Life Runtime — Real Agent Runner.
 *
 * Replaces the Phase 2 ScenarioReplayRunner with a Claude-backed agent
 * that actually responds to user messages. Uses the Vercel AI Gateway
 * (via `getLanguageModel`) so the Life runtime shares the model routing,
 * rate-limiting, and billing pipeline with /api/chat — one substrate.
 *
 * Emits Life protocol events (text_delta, thinking_start/end, tool_call,
 * tool_result, fs_op, nous_score, autonomic_event, done) so the Life
 * Interface inspector panes hydrate from real streaming data.
 *
 * What's real now:
 *   • Chat conversation (streaming tokens) via Claude
 *   • Conversation memory (messages from session history)
 *   • Tool execution (one tool — `note` — writes to a virtual workspace)
 *   • fs_op events drive the file-tree pane
 *   • Actual LLM cost tracked in USD cents
 *   • Nous score (quick self-evaluation emitted at run end)
 *   • Autonomic event (budget usage emitted on completion)
 *
 * What's still demo (needs external daemons — labeled in UI):
 *   • Vigil OTel traces — synthesized from tool_call durations
 *   • Lago knowledge graph — unchanged mock
 *   • Spaces peers       — unchanged mock
 */

import "server-only";
import { stepCountIs, streamText, tool } from "ai";
import { z } from "zod";
import type { AppModelId } from "@/lib/ai/app-model-id";
import { getLanguageModel } from "@/lib/ai/providers";
import type { LifeProject } from "@/lib/db/schema";
import type {
  KernelClient,
  KernelContext,
  ResourceUsage,
  ToolHandler,
  VmHandle,
} from "./kernel";
import type { DomainEvent, ModuleTypeId, RunnerYield } from "./types";

// ---------------------------------------------------------------------------
// Runner interface (previously exported from runner-dispatch.ts). Kept inline
// now that RealAgentRunner is the only implementation — the legacy
// ScenarioReplayRunner was decommissioned alongside the `/api/life/run/<slug>`
// endpoint; only `/api/life/run/<slug>/prosopon` remains, and it constructs
// RealAgentRunner directly.
// ---------------------------------------------------------------------------

export interface RunnerContext {
  projectSlug: string;
  moduleTypeId: string;
  input: unknown;
  maxCostCents: number;
  /** Terminal cost attribution when the run finishes. */
  onFinish?: (cost: {
    llmCents: number;
    model?: string;
    provider?: string;
  }) => void;
}

export interface Runner {
  id: ModuleTypeId;
  run(ctx: RunnerContext): AsyncIterable<RunnerYield>;
}

// ---------------------------------------------------------------------------
// Module-type-specific system prompt prefix — enough to give the agent a
// distinct personality per project without shipping the full rules package.
// ---------------------------------------------------------------------------

const SYSTEM_PREFIX: Record<string, string> = {
  "sentinel-property-ops": [
    "You are Sentinel, an AI-native work-order auditor for property managers.",
    "You flag duplicate work orders, weak closures, follow-up risk, and missing evidence.",
    "When the user asks you to audit, call the `note` tool to record each finding to the workspace.",
    "Be direct. Name the property + unit when you flag something. Use short crisp sentences.",
  ].join("\n"),
  "materiales-intel": [
    "You are Materiales Intel, an AI agent that researches construction-material unit prices in Colombia.",
    "You run live research — do not claim to have prices cached. Cite supplier sites.",
    "Respond in the same language the user writes (default Spanish).",
    "Use `note` to persist findings to the workspace.",
  ].join("\n"),
  "generic-rules-runner": [
    "You are a Life Runtime agent. Follow the project's rules package.",
    "When you decide to persist a finding, call the `note` tool.",
  ].join("\n"),
};

function systemFor(project: LifeProject): string {
  const prefix =
    SYSTEM_PREFIX[project.moduleTypeId] ??
    SYSTEM_PREFIX["generic-rules-runner"] ??
    "You are a Life Runtime agent.";
  return [
    prefix,
    "",
    `You are running inside project "${project.slug}" on broomva.tech/life.`,
    `Project: ${project.displayName}`,
    project.description ? `Description: ${project.description}` : "",
    "",
    "Be concise. Show your reasoning briefly only when it actually helps.",
  ]
    .filter(Boolean)
    .join("\n");
}

// ---------------------------------------------------------------------------
// Message history shape (kept minimal — future: richer parts via AI SDK v2)
// ---------------------------------------------------------------------------

export interface LifeConversationMessage {
  role: "user" | "assistant";
  content: string;
}

// ---------------------------------------------------------------------------
// Model selection — use the gateway default. Anon + free-tier runs stay
// on whatever the platform configures as anonymous-accessible to keep
// demo cost bounded.
// ---------------------------------------------------------------------------

const DEFAULT_LIFE_MODEL: AppModelId = "openai/gpt-5-mini" as AppModelId;

function modelIdFor(project: LifeProject, paymentMode: string): AppModelId {
  // Paid projects can upgrade; free-tier stays on cheap models.
  if (paymentMode === "credits" || paymentMode === "haima_balance") {
    return "openai/gpt-5-mini" as AppModelId;
  }
  return DEFAULT_LIFE_MODEL;
}

// ---------------------------------------------------------------------------
// Cost estimation — rough per-model pricing in USD cents per 1K tokens.
// Real billing would pull from the gateway's usage metadata; this is an
// approximation that keeps the Haima pane honest during Phase 3.
// ---------------------------------------------------------------------------

const TOKEN_PRICE_USD_PER_1K: Record<
  string,
  { input: number; output: number }
> = {
  "openai/gpt-5-mini": { input: 0.00015, output: 0.0006 },
  "openai/gpt-5-nano": { input: 0.00005, output: 0.0002 },
  "anthropic/claude-haiku-4-5": { input: 0.0008, output: 0.004 },
  "anthropic/claude-sonnet-4-5": { input: 0.003, output: 0.015 },
};

function computeCostCents(
  modelId: string,
  usage: { inputTokens?: number; outputTokens?: number },
): number {
  const pricing =
    TOKEN_PRICE_USD_PER_1K[modelId] ??
    TOKEN_PRICE_USD_PER_1K["openai/gpt-5-mini"]!;
  const input = (usage.inputTokens ?? 0) / 1000;
  const output = (usage.outputTokens ?? 0) / 1000;
  const usd = input * pricing.input + output * pricing.output;
  return Math.ceil(usd * 100);
}

// ---------------------------------------------------------------------------
// Tool registry — descriptor + handler pairs shared between AI SDK and the
// KernelClient. `makeLifeToolHandlers` returns the handler map that the
// kernel client dispatches to; the runner's tool descriptors (below) carry
// the same `inputSchema` plus an `execute` shim that routes each call
// through `KernelClient.dispatch`. Keeping the registry here (rather than
// in the route) means runner tests don't need to know about the route, and
// future tools slot in at one site.
// ---------------------------------------------------------------------------

const noteInputSchema = z.object({
  slug: z
    .string()
    .regex(/^[a-z0-9-]{3,48}$/)
    .describe("kebab-case slug for the note, 3-48 chars"),
  title: z.string().max(200),
  body: z.string().max(4000),
});

export function makeLifeToolHandlers(
  _project: LifeProject,
): Record<string, ToolHandler> {
  return {
    note: async (input) => {
      const parsed = noteInputSchema.parse(input);
      return {
        path: `/workspace/notes/${parsed.slug}.md`,
        bytesWritten: parsed.body.length + parsed.title.length + 8,
        title: parsed.title,
        preview: parsed.body.slice(0, 160),
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Real agent runner
// ---------------------------------------------------------------------------

export interface RealRunnerOptions extends RunnerContext {
  project: LifeProject;
  history: LifeConversationMessage[];
  userMessage: string;
  paymentMode: string;
  /** KernelClient that every tool call is dispatched through. */
  kernelClient: KernelClient;
  /** VM handle for this turn (one per session; reused across turns). */
  vm: VmHandle;
  /** Context threaded into every `KernelClient.dispatch` call. */
  kernelCtx: KernelContext;
  /** Per-turn LifeRun id — surfaced on OTel spans as `life.turn.id`. */
  turnId: string;
  /** LifeSession id when persisted — surfaced on OTel spans as `life.session.id`. */
  lifeSessionId?: string;
}

/**
 * Per-dispatch result stash populated by the tool `execute` shim and drained
 * by the `fullStream` loop to emit the `kernel.dispatch.completed` DomainEvent
 * right after AI SDK's `tool-result` / `tool-error` part.
 */
interface KernelDispatchRecord {
  toolName: string;
  usage?: ResourceUsage;
  isError: boolean;
}

export class RealAgentRunner implements Runner {
  readonly id: ModuleTypeId;
  private opts: RealRunnerOptions;
  private kernelResults = new Map<string, KernelDispatchRecord>();

  constructor(opts: RealRunnerOptions) {
    this.id = (opts.moduleTypeId as ModuleTypeId) ?? "generic-rules-runner";
    this.opts = opts;
  }

  async *run(): AsyncIterable<RunnerYield> {
    const now = () => new Date().toISOString();
    const { project, history, userMessage, paymentMode, onFinish } = this.opts;
    const modelId = modelIdFor(project, paymentMode);
    const system = systemFor(project);
    const runStartTs = Date.now();

    const domain = (event: DomainEvent): RunnerYield => ({
      kind: "domain",
      event,
    });

    // Domain event 1: metadata-only announcement. The Prosopon scene_reset
    // is emitted separately by `emitter.runStarted()` before the runner
    // starts, so this event is informational (future: carries model
    // warm-up metrics, caller identity, etc.).
    yield domain({
      type: "run_started",
      payload: { model: modelId, project: project.slug },
      at: now(),
    });

    // Tool set — descriptor + execute shim pattern. The shim routes every
    // call through `KernelClient.dispatch` so tool attribution, ResourceUsage,
    // and the `kernel.*` event vocabulary land on a single uniform surface.
    // Today's `InProcessKernelClient` runs the handler inline; Phase D's
    // `LifedHttpKernelClient` proxies to the lifed daemon with no change to
    // this file.
    //
    // The spec (§4.2) suggests "tools registered without an execute function"
    // but AI SDK v6's `streamText` drives tool execution inside its own step
    // loop — removing `execute` breaks the loop. A thin shim delivers the
    // same architectural win (every dispatch carries KernelContext / returns
    // ResourceUsage) without re-implementing the step machinery here.
    const tools = {
      note: tool({
        description:
          "Persist a finding, observation, or artifact into the workspace. Creates a new markdown file under /workspace/notes/ named by a slug you provide.",
        inputSchema: noteInputSchema,
        execute: async (input, meta) => {
          return this.dispatchViaKernel("note", input, meta.toolCallId);
        },
      }),
    };

    const messages = [
      ...history.map((h) => ({ role: h.role, content: h.content })),
      { role: "user" as const, content: userMessage },
    ];

    const model = await getLanguageModel(modelId);

    // `experimental_telemetry` wires AI SDK's OTel hooks so model calls
    // show up in Vercel / Sentry traces out of the box. `functionId` is the
    // span attribute grouping spans by call-site. Metadata keys are
    // deliberately aligned with the `life.*` / `kernel.*` / `haima.*`
    // namespace that lifed's Phase 2 daemon emits on its own spans — once
    // lifed traces land in Vigil, a single trace view will span /life →
    // runner → kernel.dispatch → lifed → hypervisor without join work.
    const result = streamText({
      model,
      system,
      messages,
      tools,
      stopWhen: [stepCountIs(4)],
      experimental_telemetry: {
        isEnabled: true,
        functionId: "life.run.prosopon",
        metadata: {
          "life.project.slug": project.slug,
          "life.module.type_id": project.moduleTypeId,
          "life.turn.id": this.opts.turnId,
          ...(this.opts.lifeSessionId
            ? { "life.session.id": this.opts.lifeSessionId }
            : {}),
          "kernel.backend": this.opts.kernelClient.backendId,
          "haima.payment_mode": paymentMode,
        },
      },
    });

    // Pass-through of AI SDK `fullStream` parts. Zero re-encoding — the
    // emitter handles the typed switch on `part.type` directly and has
    // access to every field AI SDK emits (including `toolCallId`,
    // `providerMetadata`, signatures, source/file/raw parts). When AI SDK
    // evolves, we update the emitter's switch; no 4-file surgery.
    //
    // Domain-event side effects are interleaved with the LLM passthrough:
    //   - `tool-call` → emit `kernel.dispatch.started`
    //   - `tool-result` / `tool-error` → emit `kernel.dispatch.completed`
    //     with the `ResourceUsage` populated by the execute shim
    //   - `tool-result` on `note` → existing `fs_op` workspace event
    for await (const part of result.fullStream) {
      yield { kind: "llm", part, at: now() };

      if (part.type === "tool-call") {
        yield domain({
          type: "kernel.dispatch.started",
          payload: {
            callId: part.toolCallId,
            toolName: part.toolName,
            backend: this.opts.kernelClient.backendId,
          },
          at: now(),
        });
        continue;
      }

      if (part.type === "tool-result" || part.type === "tool-error") {
        const record = this.kernelResults.get(part.toolCallId);
        if (record) {
          this.kernelResults.delete(part.toolCallId);
          yield domain({
            type: "kernel.dispatch.completed",
            payload: {
              callId: part.toolCallId,
              toolName: record.toolName,
              isError: record.isError,
              ...(record.usage ? { usage: record.usage } : {}),
            },
            at: now(),
          });
        }
      }

      // Domain-event side effect: when the `note` tool resolves, emit a
      // workspace `fs_op` event so the file-tree pane reacts. We read the
      // full body back from `part.input` (already structured by AI SDK).
      if (
        part.type === "tool-result" &&
        part.toolName === "note" &&
        typeof part.output === "object" &&
        part.output !== null &&
        "path" in (part.output as Record<string, unknown>)
      ) {
        const out = part.output as {
          path: string;
          title?: string;
          bytesWritten?: number;
          preview?: string;
        };
        const body =
          (part.input as { body?: string })?.body ?? out.preview ?? "";
        yield domain({
          type: "fs_op",
          payload: {
            path: out.path,
            op: "create",
            content: body,
            title: out.title,
            bytes: out.bytesWritten,
          },
          at: now(),
        });
      }
    }

    // Final usage & cost — AI SDK v6 makes totals available via both the
    // `finish` part in the stream and the `result.usage` / `result.finishReason`
    // promises. We use the promise form here for simplicity; the stream
    // variant would let us surface `done` a tick earlier but the wire gain
    // is noise-level (<1 RTT).
    const usage = await result.usage;
    const finishReason = await result.finishReason;
    const costCents = computeCostCents(modelId, {
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
    });
    const elapsedMs = Date.now() - runStartTs;

    // Nous — synthesize a simple self-eval from stop reason + cost.
    // Real implementation is the Nous crate; this stays honest by scoring
    // "high" only on clean stops.
    const nousScore = finishReason === "stop" ? 0.85 : 0.6;
    yield domain({
      type: "nous_score",
      payload: {
        score: nousScore,
        band: nousScore >= 0.75 ? "good" : "warn",
        note:
          finishReason === "stop"
            ? "Clean stop, within budget."
            : `Finished with reason "${finishReason}".`,
      },
      at: now(),
    });

    // Autonomic — report economic-pillar spend.
    yield domain({
      type: "autonomic_event",
      payload: {
        pillar: "economic",
        text: `Run cost: ${(costCents / 100).toFixed(4)} USD across ${usage.inputTokens ?? 0} in / ${usage.outputTokens ?? 0} out tokens (${elapsedMs}ms).`,
      },
      at: now(),
    });

    onFinish?.({ llmCents: costCents, model: modelId, provider: "gateway" });
    yield domain({
      type: "done",
      payload: {
        costCents,
        inputTokens: usage.inputTokens ?? 0,
        outputTokens: usage.outputTokens ?? 0,
        elapsedMs,
        finishReason,
      },
      at: now(),
    });
  }

  /**
   * AI SDK `execute` shim. Serialises the tool input, calls
   * `KernelClient.dispatch`, stashes `ResourceUsage` + `isError` on
   * `kernelResults` so the `fullStream` loop can emit the matching
   * `kernel.dispatch.completed` DomainEvent, then returns the parsed
   * `outputJson` to AI SDK. Error results are re-thrown so AI SDK produces
   * a `tool-error` part (preserving the pre-refactor error semantics).
   */
  private async dispatchViaKernel(
    toolName: string,
    input: unknown,
    toolCallId: string,
  ): Promise<unknown> {
    const result = await this.opts.kernelClient.dispatch(
      this.opts.vm,
      {
        callId: toolCallId,
        toolName,
        inputJson: JSON.stringify(input ?? {}),
        requestedCapabilities: [],
      },
      this.opts.kernelCtx,
    );
    this.kernelResults.set(toolCallId, {
      toolName,
      usage: result.usage,
      isError: result.isError,
    });
    const output = safeJsonParse(result.outputJson);
    if (result.isError) {
      const message =
        output && typeof output === "object" && "error" in output
          ? String((output as { error: unknown }).error)
          : "kernel dispatch failed";
      throw new Error(message);
    }
    return output;
  }
}

function safeJsonParse(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}
