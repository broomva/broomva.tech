"use client";

import { LIFE_ANIMA } from "../_lib/mock-workspace";

interface Props {
  onClose: () => void;
}

export function AnimaPopover({ onClose }: Props) {
  const a = LIFE_ANIMA;
  return (
    <>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close Anima popover"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 50,
          background: "transparent",
          border: 0,
          cursor: "default",
        }}
      />
      <div
        style={{
          position: "fixed",
          top: 58,
          left: 16,
          width: 360,
          zIndex: 51,
          padding: 16,
          border: "1px solid var(--ag-border-default)",
          borderRadius: 14,
          background:
            "color-mix(in oklab, var(--ag-bg-surface) 78%, transparent)",
          backdropFilter: "blur(20px) saturate(1.4) brightness(1.05)",
          boxShadow:
            "inset 0 1px 0 oklch(1 0 0 / 0.06), var(--ag-shadow-xl)",
        }}
      >
        <div className="row" style={{ gap: 12, marginBottom: 12 }}>
          <div className="anima-avatar" style={{ width: 46, height: 46 }} />
          <div>
            <div style={{ fontFamily: "var(--ag-font-heading)", fontSize: 16 }}>
              {a.name}
            </div>
            <div
              className="mono"
              style={{ fontSize: 10.5, color: "var(--ag-text-muted)" }}
            >
              {a.soul}
            </div>
          </div>
          <span className="pill pill--accent" style={{ marginLeft: "auto" }}>
            {a.tier}
          </span>
        </div>
        <div
          className="mono"
          style={{
            fontSize: 11,
            color: "var(--ag-text-secondary)",
            marginBottom: 8,
          }}
        >
          {a.did}
        </div>
        <div
          className="mono"
          style={{
            fontSize: 10.5,
            color: "var(--ag-text-muted)",
            marginBottom: 12,
          }}
        >
          session · {a.session}
        </div>
        <div className="eyebrow" style={{ marginBottom: 6 }}>
          Beliefs
        </div>
        <div
          style={{
            fontSize: 12,
            lineHeight: 1.55,
            color: "var(--ag-text-secondary)",
          }}
        >
          {a.beliefs.slice(0, 3).map((b) => (
            <div key={b} style={{ padding: "4px 0" }}>
              · {b}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
