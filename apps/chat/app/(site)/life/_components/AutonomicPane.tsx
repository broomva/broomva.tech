"use client";

import { LIFE_HOMEO } from "../_lib/mock-workspace";

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

export function AutonomicPane() {
  const h = LIFE_HOMEO;
  return (
    <div className="right-pane">
      <div
        className="row"
        style={{ justifyContent: "space-between", marginBottom: 8 }}
      >
        <div className="eyebrow">Autonomic · three pillars</div>
        <span className="pill">mode · Autonomous</span>
      </div>
      <div className="gauge-grid gauge-grid--3" style={{ padding: 6 }}>
        <HomeoArc label="Operational" {...h.operational} />
        <HomeoArc label="Cognitive" {...h.cognitive} />
        <HomeoArc label="Economic" {...h.economic} />
      </div>
      <div className="section">Setpoints</div>
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
