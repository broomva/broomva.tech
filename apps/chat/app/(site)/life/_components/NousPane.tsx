"use client";

import { LIFE_JUDGES } from "../_lib/mock-workspace";
import type { ReplayState } from "../_lib/types";

interface Props {
  state: ReplayState;
}

export function NousPane({ state }: Props) {
  const judges = LIFE_JUDGES;
  const agg = state.nous;
  return (
    <div className="right-pane">
      <div
        className="row"
        style={{ justifyContent: "space-between", marginBottom: 8 }}
      >
        <div className="eyebrow">Nous · metacognition</div>
        {agg && (
          <span
            className={`pill ${agg.band === "good" ? "pill--accent" : ""}`}
          >
            live · {agg.score.toFixed(2)}
          </span>
        )}
      </div>
      <div className="gauge">
        <div className="gauge__label">Composite score</div>
        <div
          className="gauge__value"
          style={{
            color:
              agg?.band === "good"
                ? "oklch(0.78 0.15 155)"
                : agg?.band === "warn"
                  ? "oklch(0.87 0.18 85)"
                  : "var(--ag-text-primary)",
          }}
        >
          {agg ? agg.score.toFixed(2) : "—"}
        </div>
        <div className="gauge__sub">
          {agg?.note || "Waiting for turn to close."}
        </div>
        <div className="bar">
          <div
            className={`bar__fill ${
              agg?.band === "good" ? "bar__fill--good" : "bar__fill--warn"
            }`}
            style={{ width: `${(agg?.score || 0) * 100}%` }}
          />
        </div>
      </div>
      <div className="section">Per-axis judges</div>
      {judges.map((j) => (
        <div className="judge-card" key={j.axis}>
          <div className="judge-card__head">
            <div style={{ fontFamily: "var(--ag-font-heading)", fontSize: 13 }}>
              {j.axis}
            </div>
            <div className={`judge-card__score judge-card__score--${j.band}`}>
              {j.score.toFixed(2)}
            </div>
          </div>
          <div className="bar">
            <div
              className={`bar__fill bar__fill--${
                j.band === "good" ? "good" : "warn"
              }`}
              style={{ width: `${j.score * 100}%` }}
            />
          </div>
          <div className="judge-card__body">{j.note}</div>
        </div>
      ))}
    </div>
  );
}
