"use client";

import { LIFE_HAIMA } from "../_lib/mock-workspace";
import type { LiveRunMeta } from "../_lib/use-live-run";
import { formatCents } from "../_lib/autonomy";

interface Props {
  /**
   * When present, pane renders real session-level spend accumulated by
   * `useLiveRun`. Otherwise falls back to the static mock data that
   * documents the Haima design intent.
   */
  liveMeta?: LiveRunMeta;
}

const SESSION_BUDGET_CENTS = 80; // $0.80/session soft ceiling for the free demo tier

export function HaimaPane({ liveMeta }: Props) {
  if (liveMeta && typeof liveMeta.totalCostCents === "number") {
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
          <span className="pill pill--accent">live · {liveMeta.paymentMode ?? "—"}</span>
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
            {etaMin !== null && `· eta ${etaMin} turns to ceiling`}
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
  // Fallback: original static mock kept so the pane still renders on
  // projects that aren't wired to the live stream.
  const h = LIFE_HAIMA;
  const pct = h.session_spend / h.session_budget;
  return (
    <div className="right-pane">
      <div
        className="row"
        style={{ justifyContent: "space-between", marginBottom: 8 }}
      >
        <div className="eyebrow">Haima · circulatory</div>
        <span className="pill">demo</span>
      </div>
      <div className="gauge">
        <div className="gauge__label">Session spend</div>
        <div className="gauge__value">
          ${h.session_spend.toFixed(2)}{" "}
          <span style={{ color: "var(--ag-text-muted)", fontSize: 13 }}>
            / ${h.session_budget.toFixed(2)}
          </span>
        </div>
        <div className="bar">
          <div
            className={`bar__fill ${pct > 0.85 ? "bar__fill--warn" : ""}`}
            style={{ width: `${pct * 100}%` }}
          />
        </div>
        <div className="gauge__sub" style={{ marginTop: 8 }}>
          burn rate · $0.012 / min · eta ~48m to ceiling
        </div>
      </div>
      <div className="gauge-grid" style={{ marginTop: 12 }}>
        <div className="gauge">
          <div className="gauge__label">Tokens in</div>
          <div className="gauge__value">{h.tokens_in.toLocaleString()}</div>
        </div>
        <div className="gauge">
          <div className="gauge__label">Tokens out</div>
          <div className="gauge__value">{h.tokens_out.toLocaleString()}</div>
        </div>
        <div className="gauge">
          <div className="gauge__label">x402 txs</div>
          <div className="gauge__value">{h.x402_txs}</div>
          <div className="gauge__sub">{h.last_pay}</div>
        </div>
        <div className="gauge">
          <div className="gauge__label">Wallet</div>
          <div
            className="gauge__value"
            style={{ fontSize: 13, fontFamily: "var(--ag-font-mono)" }}
          >
            0x9f4…b21
          </div>
          <div className="gauge__sub">secp256k1 · haima</div>
        </div>
      </div>
    </div>
  );
}
