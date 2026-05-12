"use client";

import type { ReplayState } from "../_lib/types";
import type { ProsoponRunMeta } from "../_lib/use-prosopon-run";

interface Props {
  state: ReplayState;
  /** Live Prosopon run meta (unused today — reserved for Nous-crate per-axis scores). */
  liveMeta?: ProsoponRunMeta;
}

export function NousPane({ state }: Props) {
  const agg = state.nous;

  if (!agg) {
    return (
      <div className="right-pane">
        <div className="eyebrow" style={{ marginBottom: 10 }}>
          Nous · metacognition
        </div>
        <div className="pane-empty">
          <div className="pane-empty__title">Waiting for turn to close</div>
          <div className="pane-empty__body">
            When the agent finishes a turn it emits a composite Nous score
            (novelty + relevance + specificity) plus a short note. That score
            appears here and feeds the autonomic controller.
          </div>
          <div className="pane-empty__meta">source · Nous crate</div>
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
        <div className="eyebrow">Nous · metacognition</div>
        <span
          className={`pill ${agg.band === "good" ? "pill--accent" : ""}`}
        >
          live · {agg.score.toFixed(2)}
        </span>
      </div>
      <div className="gauge">
        <div className="gauge__label">Composite score</div>
        <div
          className="gauge__value"
          style={{
            color:
              agg.band === "good"
                ? "oklch(0.78 0.15 155)"
                : agg.band === "warn"
                  ? "oklch(0.87 0.18 85)"
                  : "var(--ag-text-primary)",
          }}
        >
          {agg.score.toFixed(2)}
        </div>
        <div className="gauge__sub">{agg.note || "No note provided."}</div>
        <div className="bar">
          <div
            className={`bar__fill ${
              agg.band === "good" ? "bar__fill--good" : "bar__fill--warn"
            }`}
            style={{ width: `${agg.score * 100}%` }}
          />
        </div>
      </div>
      <div className="section">Per-axis judges</div>
      <div className="pane-empty pane-empty--inline">
        <div className="pane-empty__body">
          Per-axis breakdown (novelty / relevance / specificity) lands here
          once the Nous crate is wired into the Life runtime.
        </div>
      </div>
    </div>
  );
}
