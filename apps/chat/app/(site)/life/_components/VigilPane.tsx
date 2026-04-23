"use client";

import { formatCents } from "../_lib/autonomy";
import type { ReplayState } from "../_lib/types";
import type { ProsoponRunMeta } from "../_lib/use-prosopon-run";

interface Props {
  state: ReplayState;
  /** Live Prosopon run meta — drives cost + tokens + duration. */
  liveMeta?: ProsoponRunMeta;
}

interface Span {
  name: string;
  start: number;
  dur: number;
  kind: "tool" | "root";
}

/**
 * Synthesize OTel-like spans from the tool_call / tool_result timing stored
 * on `state.messages[].tools`. Each completed tool gets a span keyed by the
 * tool's name; running tools get a span that extends to `state.t`. Adds a
 * root span (`arcan.tick`) so the pane isn't empty while a turn is in flight
 * before the first tool lands.
 */
function deriveSpans(state: ReplayState): Span[] {
  const spans: Span[] = [];
  const now = state.t;
  for (const m of state.messages) {
    for (const t of m.tools ?? []) {
      const end = t.endT ?? now;
      spans.push({
        name: t.name,
        kind: "tool",
        start: t.t,
        dur: Math.max(1, end - t.t),
      });
    }
  }
  if (state.t > 0) {
    spans.unshift({
      name: "arcan.tick",
      kind: "root",
      start: 0,
      dur: state.t,
    });
  }
  return spans;
}

export function VigilPane({ state, liveMeta }: Props) {
  const spans = deriveSpans(state);
  const cur = state.t || 0;
  const total = Math.max(cur, 1000);
  const visibleSpans = spans.filter((s) => s.start <= cur);
  const toolCount = state.messages.reduce(
    (sum, m) => sum + (m.tools?.length ?? 0),
    0,
  );
  const costCents = liveMeta?.totalCostCents ?? 0;
  const tokensIn = liveMeta?.tokensIn ?? 0;
  const tokensOut = liveMeta?.tokensOut ?? 0;
  const durationMs = liveMeta?.durationMs ?? cur;

  if (!liveMeta) {
    return (
      <div className="right-pane">
        <div className="eyebrow" style={{ marginBottom: 10 }}>
          Vigil · spans · this tick
        </div>
        <div className="pane-empty">
          <div className="pane-empty__title">No run in flight</div>
          <div className="pane-empty__body">
            Send a message to start a run. Spans, tokens, cost, and duration
            appear here live as the agent works.
          </div>
          <div className="pane-empty__meta">source · Vigil OTel collector</div>
        </div>
      </div>
    );
  }

  return (
    <div className="right-pane">
      <div
        className="row"
        style={{ justifyContent: "space-between", marginBottom: 8 }}
      >
        <div className="eyebrow">Vigil · spans · this tick</div>
        <span className="pill pill--accent">
          live · {visibleSpans.length} span{visibleSpans.length === 1 ? "" : "s"}
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
            sp.kind === "root"
              ? "trace-row__fill--llm"
              : "trace-row__fill--tool";
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
          <div className="gauge__value">{formatCents(costCents)}</div>
          <div className="gauge__sub">via haima</div>
        </div>
        <div className="gauge">
          <div className="gauge__label">run.status</div>
          <div
            className="gauge__value"
            style={{ fontSize: 14, color: "oklch(0.78 0.15 155)" }}
          >
            {liveMeta.status}
          </div>
          <div className="gauge__sub">
            {liveMeta.runId ? `run ${liveMeta.runId.slice(0, 8)}…` : "—"}
          </div>
        </div>
        <div className="gauge">
          <div className="gauge__label">gen_ai.tokens</div>
          <div
            className="gauge__value"
            style={{ fontSize: 13, fontFamily: "var(--ag-font-mono)" }}
          >
            {tokensIn.toLocaleString()} → {tokensOut.toLocaleString()}
          </div>
          <div className="gauge__sub">in → out</div>
        </div>
        <div className="gauge">
          <div className="gauge__label">run.duration</div>
          <div
            className="gauge__value"
            style={{ fontSize: 13, fontFamily: "var(--ag-font-mono)" }}
          >
            {(durationMs / 1000).toFixed(2)}s
          </div>
          <div className="gauge__sub">server-measured</div>
        </div>
      </div>
    </div>
  );
}
