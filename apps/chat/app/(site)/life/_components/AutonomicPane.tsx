"use client";

import type { ReplayState } from "../_lib/types";
import type { ProsoponRunMeta } from "../_lib/use-prosopon-run";

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

interface AutoProps {
  state?: ReplayState;
  liveMeta?: ProsoponRunMeta;
}

const ECONOMIC_BUDGET_CENTS = 80; // matches Haima pane ceiling

/**
 * Derive three-pillar homeostasis from the live run state.
 * - Operational: ratio of tools that returned `ok` vs total tools invoked.
 * - Cognitive:  proxy from conversation length (turns + active streams).
 * - Economic:   session spend / session budget (Haima surface).
 */
function derivePillars(state: ReplayState, liveMeta: ProsoponRunMeta) {
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
  if (!state || !liveMeta) {
    return (
      <div className="right-pane">
        <div className="eyebrow" style={{ marginBottom: 10 }}>
          Autonomic · three pillars
        </div>
        <div className="pane-empty">
          <div className="pane-empty__title">Waiting for first turn</div>
          <div className="pane-empty__body">
            Homeostasis arcs (operational / cognitive / economic) hydrate
            once a turn has executed. They rebalance in real time as the
            agent runs.
          </div>
          <div className="pane-empty__meta">source · Autonomic crate</div>
        </div>
      </div>
    );
  }

  const h = derivePillars(state, liveMeta);
  const hasData = state.messages.length > 0 || liveMeta.totalCostCents > 0;

  return (
    <div className="right-pane">
      <div
        className="row"
        style={{ justifyContent: "space-between", marginBottom: 8 }}
      >
        <div className="eyebrow">Autonomic · three pillars</div>
        <span className="pill pill--accent">
          live · {hasData ? "regulating" : "idle"}
        </span>
      </div>
      <div className="gauge-grid gauge-grid--3" style={{ padding: 6 }}>
        <HomeoArc label="Operational" {...h.operational} />
        <HomeoArc label="Cognitive" {...h.cognitive} />
        <HomeoArc label="Economic" {...h.economic} />
      </div>
      <div className="section">Live signals</div>
      <div className="judge-card" style={{ marginTop: 6 }}>
        <div className="judge-card__head">
          <div
            style={{
              fontFamily: "var(--ag-font-mono)",
              fontSize: 11.5,
              color: "var(--ag-text-secondary)",
            }}
          >
            messages
          </div>
          <div
            style={{
              fontFamily: "var(--ag-font-heading)",
              fontSize: 14,
              color: "oklch(0.78 0.15 155)",
            }}
          >
            {state.messages.length}
          </div>
        </div>
      </div>
      <div className="judge-card" style={{ marginTop: 6 }}>
        <div className="judge-card__head">
          <div
            style={{
              fontFamily: "var(--ag-font-mono)",
              fontSize: 11.5,
              color: "var(--ag-text-secondary)",
            }}
          >
            fs_ops
          </div>
          <div
            style={{
              fontFamily: "var(--ag-font-heading)",
              fontSize: 14,
              color: "oklch(0.78 0.15 155)",
            }}
          >
            {state.fsOps.length}
          </div>
        </div>
      </div>
      <div className="judge-card" style={{ marginTop: 6 }}>
        <div className="judge-card__head">
          <div
            style={{
              fontFamily: "var(--ag-font-mono)",
              fontSize: 11.5,
              color: "var(--ag-text-secondary)",
            }}
          >
            autonomic.pillars
          </div>
          <div
            style={{
              fontFamily: "var(--ag-font-heading)",
              fontSize: 14,
              color: "oklch(0.78 0.15 155)",
            }}
          >
            {state.autonomic.length}
          </div>
        </div>
      </div>
    </div>
  );
}
