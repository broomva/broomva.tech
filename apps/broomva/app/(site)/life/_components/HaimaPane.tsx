"use client";

import { formatCents } from "../_lib/autonomy";
import type { ProsoponRunMeta } from "../_lib/use-prosopon-run";

interface Props {
  liveMeta?: ProsoponRunMeta;
}

const SESSION_BUDGET_CENTS = 80; // $0.80/session soft ceiling for the free-tier

export function HaimaPane({ liveMeta }: Props) {
  if (!liveMeta) {
    return (
      <div className="right-pane">
        <div className="eyebrow" style={{ marginBottom: 10 }}>
          Haima · circulatory
        </div>
        <div className="pane-empty">
          <div className="pane-empty__title">Wallet idle</div>
          <div className="pane-empty__body">
            Session spend, per-turn cost, payment rail, and session id stream
            here once a run starts. The circulatory layer settles through
            credits, free-tier, or x402 depending on the caller.
          </div>
          <div className="pane-empty__meta">source · Haima engine</div>
        </div>
      </div>
    );
  }

  const total = liveMeta.totalCostCents;
  const last = liveMeta.lastTurnCostCents;
  const pct = Math.min(1, total / SESSION_BUDGET_CENTS);
  const etaMin =
    last > 0
      ? Math.round((SESSION_BUDGET_CENTS - total) / Math.max(last, 1))
      : null;

  return (
    <div className="right-pane">
      <div
        className="row"
        style={{ justifyContent: "space-between", marginBottom: 8 }}
      >
        <div className="eyebrow">Haima · circulatory</div>
        <span className="pill pill--accent">
          live · {liveMeta.paymentMode ?? "—"}
        </span>
      </div>
      <div className="gauge">
        <div className="gauge__label">Session spend</div>
        <div className="gauge__value">
          {formatCents(total)}{" "}
          <span style={{ color: "var(--ag-text-muted)", fontSize: 13 }}>
            / {formatCents(SESSION_BUDGET_CENTS)}
          </span>
        </div>
        <div className="bar">
          <div
            className={`bar__fill ${pct > 0.85 ? "bar__fill--warn" : ""}`}
            style={{ width: `${pct * 100}%` }}
          />
        </div>
        <div className="gauge__sub" style={{ marginTop: 8 }}>
          last turn · {formatCents(last)}
          {etaMin !== null && ` · eta ${etaMin} turns to ceiling`}
        </div>
      </div>
      <div className="gauge-grid" style={{ marginTop: 12 }}>
        <div className="gauge">
          <div className="gauge__label">Session id</div>
          <div
            className="gauge__value"
            style={{ fontSize: 13, fontFamily: "var(--ag-font-mono)" }}
          >
            {liveMeta.sessionId
              ? `${liveMeta.sessionId.slice(0, 8)}…`
              : "—"}
          </div>
          <div className="gauge__sub">LifeSession</div>
        </div>
        <div className="gauge">
          <div className="gauge__label">Run id</div>
          <div
            className="gauge__value"
            style={{ fontSize: 13, fontFamily: "var(--ag-font-mono)" }}
          >
            {liveMeta.runId ? `${liveMeta.runId.slice(0, 8)}…` : "—"}
          </div>
          <div className="gauge__sub">LifeRun</div>
        </div>
        <div className="gauge">
          <div className="gauge__label">Status</div>
          <div className="gauge__value" style={{ fontSize: 16 }}>
            {liveMeta.status}
          </div>
          <div className="gauge__sub">
            {liveMeta.error ? liveMeta.error.slice(0, 40) : "—"}
          </div>
        </div>
        <div className="gauge">
          <div className="gauge__label">Rail</div>
          <div className="gauge__value" style={{ fontSize: 13 }}>
            {liveMeta.paymentMode === "x402"
              ? "x402"
              : liveMeta.paymentMode === "credits"
                ? "platform credits"
                : liveMeta.paymentMode === "free_tier"
                  ? "free-tier"
                  : liveMeta.paymentMode ?? "—"}
          </div>
          <div className="gauge__sub">settlement</div>
        </div>
      </div>
    </div>
  );
}
