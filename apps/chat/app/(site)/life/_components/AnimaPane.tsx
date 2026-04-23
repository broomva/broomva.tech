"use client";

import { LIFE_ANIMA } from "../_lib/mock-workspace";

export function AnimaPane() {
  const a = LIFE_ANIMA;
  return (
    <div className="right-pane">
      <div
        className="row"
        style={{ justifyContent: "space-between", marginBottom: 10 }}
      >
        <div className="eyebrow">Anima · identity</div>
        <span className="pill pill--accent">{a.tier}</span>
      </div>
      <div
        className="gauge"
        style={{ display: "flex", gap: 12, alignItems: "center" }}
      >
        <div className="anima-avatar" style={{ width: 54, height: 54 }} />
        <div>
          <div style={{ fontFamily: "var(--ag-font-heading)", fontSize: 18 }}>
            {a.name}
          </div>
          <div
            style={{
              fontFamily: "var(--ag-font-mono)",
              fontSize: 10.5,
              color: "var(--ag-text-muted)",
            }}
          >
            {a.soul}
          </div>
          <div
            style={{
              fontFamily: "var(--ag-font-mono)",
              fontSize: 10.5,
              color: "var(--ag-text-muted)",
            }}
          >
            {a.did}
          </div>
        </div>
      </div>
      <div className="section">Beliefs (active)</div>
      {a.beliefs.map((b) => (
        <div
          key={b}
          className="judge-card"
          style={{ fontSize: 12, marginTop: 6 }}
        >
          <div style={{ color: "var(--ag-text-primary)", lineHeight: 1.55 }}>
            {b}
          </div>
        </div>
      ))}
      <div className="section">Trust vector</div>
      {Object.entries(a.trust).map(([k, v]) => (
        <div className="judge-card" key={k} style={{ marginTop: 6 }}>
          <div className="judge-card__head">
            <div
              style={{
                fontFamily: "var(--ag-font-mono)",
                fontSize: 11.5,
                color: "var(--ag-text-secondary)",
              }}
            >
              {k}
            </div>
            <div
              style={{ fontFamily: "var(--ag-font-heading)", fontSize: 14 }}
            >
              {v.toFixed(2)}
            </div>
          </div>
          <div className="bar">
            <div
              className="bar__fill"
              style={{ width: `${v * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
