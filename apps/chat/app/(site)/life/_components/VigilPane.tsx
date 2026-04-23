"use client";

import { LIFE_TRACES } from "../_lib/mock-workspace";
import type { LifeTraceSpan, ReplayState } from "../_lib/types";
import type { LiveRunMeta } from "../_lib/use-live-run";
import { formatCents } from "../_lib/autonomy";

interface Props {
  state: ReplayState;
  /** Present on live-streaming projects — used to derive live cost. */
  liveMeta?: LiveRunMeta;
}

/**
 * Synthesize OTel-like spans from the tool_call / tool_result timing stored
 * on `state.messages[].tools`. Each completed tool gets a span keyed by the
 * tool's name; running tools get a span that extends to `state.t`.
 *
 * This is a best-effort derivation until a real Vigil OTel collector is
 * wired — but it's all live data from the current run.
 */
function deriveSpansFromState(state: ReplayState): LifeTraceSpan[] {
  const spans: LifeTraceSpan[] = [];
  const now = state.t;
  for (const m of state.messages) {
    for (const t of m.tools ?? []) {
      const end = t.endT ?? now;
      spans.push({
        name: t.name,
        kind: "tool",
        start: t.t,
        dur: Math.max(1, end - t.t),
        color: "tool",
      });
    }
  }
  // Add a root span for the whole run so the pane is never empty while a
  // turn is in flight (even before the first tool lands).
  if (state.t > 0) {
    spans.unshift({
      name: "arcan.tick",
      kind: "root",
      start: 0,
      dur: state.t,
      color: "llm",
    });
  }
  return spans;
}

export function VigilPane({ state, liveMeta }: Props) {
  // Prefer real derived spans when a live run is present; fall back to the
  // design-reference mock spans for the scenario replay path.
  const isLive = !!liveMeta;
  const spans = isLive ? deriveSpansFromState(state) : LIFE_TRACES;
  const cur = state.t || (isLive ? 1000 : 17100);
  const total = Math.max(cur, 1000);
  const visibleSpans = spans.filter((s) => s.start <= cur);
  const toolCount = state.messages.reduce(
    (sum, m) => sum + (m.tools?.length ?? 0),
    0,
  );
  const costCents = liveMeta?.totalCostCents ?? 0;

  return (
    <div className="right-pane">
      <div
        className="row"
        style={{ justifyContent: "space-between", marginBottom: 8 }}
      >
        <div className="eyebrow">Vigil · spans · this tick</div>
        <span className={`pill ${isLive ? "pill--accent" : ""}`}>
          {isLive ? "live · " : "demo · "}
          {visibleSpans.length} spans
        </span>
      </div>
      <div className="preview-frame" style={{ padding: "10px 12px" }}>
        {visibleSpans.length === 0 && (
          <div
            style={{
              color: "var(--ag-text-muted)",
              fontStyle: "italic",
              fontSize: 11.5,
            }}
          >
            No spans yet. Tool invocations will appear here as the agent runs.
          </div>
        )}
        {visibleSpans.map((sp) => {
          const visibleDur = Math.min(sp.dur, Math.max(0, cur - sp.start));
          const leftPct = (sp.start / total) * 100;
          const widthPct = Math.max(1, (visibleDur / total) * 100);
          const cls =
            sp.color === "llm"
              ? "trace-row__fill--llm"
              : sp.color === "tool"
                ? "trace-row__fill--tool"
                : "";
          return (
            <div className="trace-row" key={`${sp.name}-${sp.start}`}>
              <span className="trace-row__name" title={sp.name}>
                {sp.name}
              </span>
              <span className="trace-row__bar">
                <span
                  className={`trace-row__fill ${cls}`}
                  style={{
                    left: `${leftPct}%`,
                    width: `${widthPct}%`,
                  }}
                />
              </span>
              <span className="trace-row__ms">{Math.round(visibleDur)}ms</span>
            </div>
          );
        })}
      </div>
      <div className="section">Semantic conventions</div>
      <div className="gauge-grid">
        <div className="gauge">
          <div className="gauge__label">tool.invocations</div>
          <div className="gauge__value">{toolCount}</div>
          <div className="gauge__sub">this session</div>
        </div>
        <div className="gauge">
          <div className="gauge__label">run.cost</div>
          <div className="gauge__value">
            {isLive ? formatCents(costCents) : "$0.14"}
          </div>
          <div className="gauge__sub">{isLive ? "live haima" : "demo"}</div>
        </div>
        <div className="gauge">
          <div className="gauge__label">run.status</div>
          <div
            className="gauge__value"
            style={{ fontSize: 14, color: "oklch(0.78 0.15 155)" }}
          >
            {isLive ? (liveMeta?.status ?? "idle") : "ok"}
          </div>
          <div className="gauge__sub">
            {isLive && liveMeta?.runId
              ? `run ${liveMeta.runId.slice(0, 8)}…`
              : "—"}
          </div>
        </div>
        <div className="gauge">
          <div className="gauge__label">gen_ai.model</div>
          <div
            className="gauge__value"
            style={{ fontSize: 13, fontFamily: "var(--ag-font-mono)" }}
          >
            {isLive ? "gpt-5-mini" : "demo"}
          </div>
          <div className="gauge__sub">via gateway</div>
        </div>
      </div>
    </div>
  );
}
