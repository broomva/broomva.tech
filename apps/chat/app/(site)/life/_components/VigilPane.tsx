"use client";

import { LIFE_TRACES } from "../_lib/mock-workspace";
import type { ReplayState } from "../_lib/types";

interface Props {
  state: ReplayState;
}

export function VigilPane({ state }: Props) {
  const cur = state.t || 17100;
  const total = Math.max(cur, 1000);
  const visibleSpans = LIFE_TRACES.filter((s) => s.start <= cur);
  return (
    <div className="right-pane">
      <div
        className="row"
        style={{ justifyContent: "space-between", marginBottom: 8 }}
      >
        <div className="eyebrow">Vigil · spans · this tick</div>
        <span className="pill">{visibleSpans.length} spans</span>
      </div>
      <div className="preview-frame" style={{ padding: "10px 12px" }}>
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
              <span className="trace-row__ms">{visibleDur}ms</span>
            </div>
          );
        })}
      </div>
      <div className="section">Semantic conventions</div>
      <div className="gauge-grid">
        <div className="gauge">
          <div className="gauge__label">gen_ai.usage.input</div>
          <div className="gauge__value">48,112</div>
          <div className="gauge__sub">tokens · $0.144</div>
        </div>
        <div className="gauge">
          <div className="gauge__label">gen_ai.usage.output</div>
          <div className="gauge__value">8,422</div>
          <div className="gauge__sub">tokens · $0.101</div>
        </div>
        <div className="gauge">
          <div className="gauge__label">tool.invocations</div>
          <div className="gauge__value">
            {(state.journal || []).filter(
              (e) => e.kind === "tool" && e.label === "TOOL",
            ).length || 6}
          </div>
          <div className="gauge__sub">spans</div>
        </div>
        <div className="gauge">
          <div className="gauge__label">error.rate</div>
          <div
            className="gauge__value"
            style={{ color: "oklch(0.78 0.15 155)" }}
          >
            0.00
          </div>
          <div className="gauge__sub">last 50 spans</div>
        </div>
      </div>
    </div>
  );
}
