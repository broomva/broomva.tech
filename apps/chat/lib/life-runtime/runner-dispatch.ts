/**
 * Life Runtime — module-type → runner implementation dispatch.
 *
 * Each ModuleTypeId maps to a `Runner` that produces an async iterable of
 * RunEvents. The runner is responsible for:
 *   - validating input against the module_type's schema
 *   - executing the agent loop (LLM calls, tool use)
 *   - emitting events in a deterministic order
 *   - staying within the cost cap passed in
 *
 * Phase 2 (this PR): runners are **scenario replayers** that stream the
 * mock scenarios from the Life Interface design (refactor / research) as
 * real SSE events. This gives us real SSE infrastructure + real DB writes
 * + real billing-path attribution without any Claude API cost.
 *
 * Phase 2.1 (follow-up PR): Sentinel runner swaps to a real audit loop
 * that calls Claude through the shared `@broomva/sentinel-property-ops`
 * package (pending OAuth shim migration in life-modules-core). Materiales
 * follows once the OAuth shim is upstreamed.
 */

import "server-only";
import { SCENARIOS } from "@/app/(site)/life/_lib/scenarios";
import type { ReplayEvent, ScenarioId } from "@/app/(site)/life/_lib/types";
import type { ModuleTypeId, RunEvent } from "./types";

export interface RunnerContext {
  projectSlug: string;
  moduleTypeId: string;
  input: unknown;
  maxCostCents: number;
  /** Terminal cost attribution when the run finishes. */
  onFinish?: (cost: { llmCents: number; model?: string; provider?: string }) => void;
}

export interface Runner {
  id: ModuleTypeId;
  run(ctx: RunnerContext): AsyncIterable<RunEvent>;
}

// ---------------------------------------------------------------------------
// Scenario replayer — shared implementation
// ---------------------------------------------------------------------------

function toIsoNow(): string {
  return new Date().toISOString();
}

/** Convert a Life scenario event (from the mock-replay data model) to a protocol RunEvent. */
function scenarioEventToRunEvent(e: ReplayEvent): RunEvent {
  const at = toIsoNow();
  switch (e.kind) {
    case "user":
      return { type: "text_start", payload: { role: "user", text: e.text }, at };
    case "agent-thinking-start":
      return { type: "thinking_start", payload: { id: e.id }, at };
    case "thinking":
      return { type: "thinking_delta", payload: { id: e.id, text: e.text }, at };
    case "agent-thinking-end":
      return { type: "thinking_end", payload: { id: e.id }, at };
    case "agent-text-start":
      return {
        type: "text_start",
        payload: { id: e.id, role: "agent", text: e.text },
        at,
      };
    case "agent-text-append":
      return { type: "text_delta", payload: { id: e.id, text: e.text }, at };
    case "tool-call":
      return {
        type: "tool_call",
        payload: {
          id: e.id,
          name: e.name,
          target: e.target,
          args: e.args,
          journalKind: e.journalKind,
        },
        at,
      };
    case "tool-result":
      return {
        type: "tool_result",
        payload: { id: e.id, result: e.result },
        at,
      };
    case "fs-op":
      return { type: "fs_op", payload: { path: e.path, op: e.op }, at };
    case "nous-score":
      return {
        type: "nous_score",
        payload: { score: e.score, band: e.band, note: e.note },
        at,
      };
    case "autonomic-event":
      return {
        type: "autonomic_event",
        payload: { pillar: e.pillar, text: e.text },
        at,
      };
    default: {
      const exhaustive: never = e;
      return { type: "error", payload: { unknown: exhaustive }, at };
    }
  }
}

/**
 * Streams scenario events over time. Uses the scenario's `t` (milliseconds
 * from start) to pace emission, so the UX matches the design prototype's
 * choreography.
 *
 * Clamps delays in [0, 600ms] to keep demos snappy over SSE.
 */
async function* replayScenario(scenarioKey: ScenarioId): AsyncIterable<RunEvent> {
  const events = SCENARIOS[scenarioKey];
  let lastT = 0;
  yield { type: "run_started", payload: { scenario: scenarioKey }, at: toIsoNow() };
  for (const ev of events) {
    const delay = Math.max(0, Math.min(600, ev.t - lastT));
    lastT = ev.t;
    if (delay > 0) {
      await new Promise((r) => setTimeout(r, delay));
    }
    yield scenarioEventToRunEvent(ev);
  }
  yield { type: "done", payload: {}, at: toIsoNow() };
}

// ---------------------------------------------------------------------------
// Registered runners (Phase 2: scenario replayers)
// ---------------------------------------------------------------------------

const MODULE_TO_SCENARIO: Record<string, ScenarioId> = {
  "sentinel-property-ops": "refactor",
  "materiales-intel": "research",
  "generic-rules-runner": "ingest",
};

class ScenarioReplayRunner implements Runner {
  readonly id: ModuleTypeId;
  constructor(moduleId: ModuleTypeId) {
    this.id = moduleId;
  }

  async *run(ctx: RunnerContext): AsyncIterable<RunEvent> {
    const scenarioKey = MODULE_TO_SCENARIO[ctx.moduleTypeId] ?? "refactor";
    for await (const ev of replayScenario(scenarioKey)) {
      yield ev;
    }
    ctx.onFinish?.({ llmCents: 0, model: "mock-replay", provider: "mock" });
  }
}

/**
 * Resolve a runner for a module type. Unknown module types fall back to the
 * generic scenario replayer so the platform degrades gracefully while new
 * module types ship.
 */
export function getRunner(moduleTypeId: string): Runner {
  const known: ModuleTypeId[] = [
    "sentinel-property-ops",
    "materiales-intel",
    "generic-rules-runner",
    "module-builder",
  ];
  const typed = (known as string[]).includes(moduleTypeId)
    ? (moduleTypeId as ModuleTypeId)
    : ("generic-rules-runner" as ModuleTypeId);
  return new ScenarioReplayRunner(typed);
}
