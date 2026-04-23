"use client";

import { LIFE_HAIMA } from "../_lib/mock-workspace";

export function HaimaPane() {
  const h = LIFE_HAIMA;
  const pct = h.session_spend / h.session_budget;
  return (
    <div className="right-pane">
      <div
        className="row"
        style={{ justifyContent: "space-between", marginBottom: 8 }}
      >
        <div className="eyebrow">Haima · circulatory</div>
        <span className="pill">x402</span>
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
