"use client";

import { LIFE_HOMEO } from "../_lib/mock-workspace";
import type { ReplayState } from "../_lib/types";
import type { LiveRunMeta } from "../_lib/use-live-run";

interface ArcProps {
  label: string;
  value: number;
  target: number;
  sub: string;
}

function HomeoArc({ label, value, target, sub }: ArcProps) {
  const r = 42;
  const C = 2 * Math.PI * r;
  const pct = Math.min(1, value);
  const color =
    value >= target * 0.95
      ? "oklch(0.78 0.15 155)"
      : value >= target * 0.7
        ? "oklch(0.87 0.18 85)"
        : "oklch(0.72 0.20 27)";
  return (
    <div>
      <div className="homeo-arc">
        <svg viewBox="0 0 110 110" width="110" height="110">
          <title>{label}</title>
          <circle
            cx="55"
            cy="55"
            r={r}
            fill="none"
            stroke="oklch(0.22 0.03 275)"
            strokeWidth="8"
          />
          <circle
            cx="55"
            cy="55"
            r={r}
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${pct * C} ${C}`}
            transform="rotate(-90 55 55)"
            style={{
              filter: `drop-shadow(0 0 6px ${color})`,
              transition: "stroke-dasharray 500ms ease",
            }}
          />
          <text
            x="55"
            y="58"
            textAnchor="middle"
            fontFamily="var(--ag-font-heading)"
            fontSize="20"
            fill="oklch(0.98 0 0)"
          >
            {(value * 100).toFixed(0)}
          </text>
          <text
            x="55"
            y="72"
            textAnchor="middle"
            fontFamily="var(--ag-font-mono)"
            fontSize="9"
            fill="oklch(0.50 0.02 275)"
          >
            / {(target * 100).toFixed(0)}
          </text>
        </svg>
      </div>
      <div className="homeo-label">{label}</div>
      <div className="homeo-val">{sub}</div>
    </div>
  );
}

const SETPOINTS = [
  { k: "pass_at_1", v: "1.00", t: "≥ 0.90", good: true },
  { k: "shield_intervention_rate", v: "0.03", t: "≤ 0.10", good: true },
  { k: "retry_rate", v: "0.08", t: "≤ 0.30", good: true },
  { k: "revert_rate", v: "0.02", t: "≤ 0.08", good: true },
  { k: "human_intervention_rate", v: "0.18", t: "≤ 0.35", good: true },
];

interface AutoProps {
  state?: ReplayState;
  liveMeta?: LiveRunMeta;
}

const ECONOMIC_BUDGET_CENTS = 80; // matches Haima pane ceiling

/**
 * Derive three-pillar homeostasis from the live run state.
 * - Operational: ratio of tools that returned `ok` vs total tools invoked
 * - Cognitive:  proxy from conversation length (turns + active streams)
 * - Economic:   session spend / session budget (Haima surface)
 *
 * Falls back to LIFE_HOMEO on the mock-replay path (materiales).
 */
function derivePillars(state: ReplayState, liveMeta: LiveRunMeta) {
  const allTools = state.messages.flatMap((m) => m.tools ?? []);
  const okTools = allTools.filter((t) => t.status === "ok").length;
  const operational =
    allTools.length === 0
      ? { value: 1, target: 1, sub: "no tools yet" }
      : {
          value: okTools / allTools.length,
          target: 1,
          sub: `${okTools}/${allTools.length} tools ok`,
        };

  const turns = state.messages.length;
  const cognitiveValue = Math.min(1, turns / 20);
  const cognitive = {
    value: 1 - cognitiveValue,
    target: 0.75,
    sub: `${turns} turn${turns === 1 ? "" : "s"} / 20 soft-cap`,
  };

  const spent = liveMeta.totalCostCents;
  const budget = ECONOMIC_BUDGET_CENTS;
  const economicValue = Math.max(0, 1 - spent / budget);
  const economic = {
    value: economicValue,
    target: 1,
    sub: `$${(spent / 100).toFixed(2)} / $${(budget / 100).toFixed(2)}`,
  };

  return { operational, cognitive, economic };
}

export function AutonomicPane({ state, liveMeta }: AutoProps) {
  const h =
    state && liveMeta ? derivePillars(state, liveMeta) : LIFE_HOMEO;
  const isLive = !!liveMeta && !!state;
  return (
    <div className="right-pane">
      <div
        className="row"
        style={{ justifyContent: "space-between", marginBottom: 8 }}
      >
        <div className="eyebrow">Autonomic · three pillars</div>
        <span className={`pill ${isLive ? "pill--accent" : ""}`}>
          {isLive ? "live · Autonomous" : "demo · Autonomous"}
        </span>
      </div>
      <div className="gauge-grid gauge-grid--3" style={{ padding: 6 }}>
        <HomeoArc label="Operational" {...h.operational} />
        <HomeoArc label="Cognitive" {...h.cognitive} />
        <HomeoArc label="Economic" {...h.economic} />
      </div>
      <div className="section">
        Setpoints{" "}
        {isLive && (
          <span
            className="pill"
            style={{
              marginLeft: "auto",
              fontSize: 9.5,
              padding: "1px 6px",
            }}
          >
            demo
          </span>
        )}
      </div>
      {SETPOINTS.map((r) => (
        <div className="judge-card" key={r.k} style={{ marginTop: 6 }}>
          <div className="judge-card__head">
            <div
              style={{
                fontFamily: "var(--ag-font-mono)",
                fontSize: 11.5,
                color: "var(--ag-text-secondary)",
              }}
            >
              {r.k}
            </div>
            <div
              style={{
                fontFamily: "var(--ag-font-heading)",
                fontSize: 14,
                color: r.good
                  ? "oklch(0.78 0.15 155)"
                  : "oklch(0.87 0.18 85)",
              }}
            >
              {r.v}
            </div>
          </div>
          <div
            style={{
              fontFamily: "var(--ag-font-mono)",
              fontSize: 10,
              color: "var(--ag-text-muted)",
              marginTop: 2,
            }}
          >
            target {r.t}
          </div>
        </div>
      ))}
    </div>
  );
}
