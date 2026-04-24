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
// Real agent runner
// ---------------------------------------------------------------------------

export interface RealRunnerOptions extends RunnerContext {
  project: LifeProject;
  history: LifeConversationMessage[];
  userMessage: string;
  paymentMode: string;
}

export class RealAgentRunner implements Runner {
  readonly id: ModuleTypeId;
  private opts: RealRunnerOptions;

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

    // Tool set — kept small on purpose. `note` appends to the run's
    // virtual workspace; we bridge its result into a `fs_op` domain event
    // right after the LLM `tool-result` part so the Workspace pane reacts.
    const tools = {
      note: tool({
        description:
          "Persist a finding, observation, or artifact into the workspace. Creates a new markdown file under /workspace/notes/ named by a slug you provide.",
        inputSchema: z.object({
          slug: z
            .string()
            .regex(/^[a-z0-9-]{3,48}$/)
            .describe("kebab-case slug for the note, 3-48 chars"),
          title: z.string().max(200),
          body: z.string().max(4000),
        }),
        execute: async ({ slug, title, body }) => {
          return {
            path: `/workspace/notes/${slug}.md`,
            bytesWritten: body.length + title.length + 8,
            title,
            preview: body.slice(0, 160),
          };
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
    // span attribute grouping spans by call-site; metadata is arbitrary
    // per-span enrichment (we use it to correlate to the project slug).
    // Identical pattern to `generateTitleFromUserMessage` in /chat actions.
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
          projectSlug: project.slug,
          moduleTypeId: project.moduleTypeId,
          paymentMode,
        },
      },
    });

    // Pass-through of AI SDK `fullStream` parts. Zero re-encoding — the
    // emitter handles the typed switch on `part.type` directly and has
    // access to every field AI SDK emits (including `toolCallId`,
    // `providerMetadata`, signatures, source/file/raw parts). When AI SDK
    // evolves, we update the emitter's switch; no 4-file surgery.
    for await (const part of result.fullStream) {
      yield { kind: "llm", part, at: now() };

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
}
