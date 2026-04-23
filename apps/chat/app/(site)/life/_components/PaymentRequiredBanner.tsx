// Human-in-the-loop approval UI for paid Life projects.
//
// Renders as a centered overlay card when the live run returns 402.
// The human decides:
//   • Approve — signs the quote with a mock-payment header (x402
//     settlement lands in a follow-up PR). Spend is tracked against
//     the local session ceiling.
//   • Cancel — dismisses the banner; the project stays paused.
//   • Enable autonomy — flips the prefs so future sub-ceiling runs
//     auto-approve without a prompt.
//
// The autonomy contract matches what a future Haima-wallet settlement
// layer will consume: per-run max + per-session ceiling + mode.

"use client";

import { useEffect, useState } from "react";
import type { PaymentQuote } from "../_lib/use-live-run";
import {
  DEFAULT_AUTONOMY,
  formatCents,
  readAutonomy,
  shouldAutoApprove,
  writeAutonomy,
  type AutonomyPrefs,
} from "../_lib/autonomy";

interface Props {
  quote: PaymentQuote;
  projectSlug: string;
  onApprove: (header: string | null) => void;
  onCancel: () => void;
}

export function PaymentRequiredBanner({
  quote,
  projectSlug,
  onApprove,
  onCancel,
}: Props) {
  const [prefs, setPrefs] = useState<AutonomyPrefs>(DEFAULT_AUTONOMY);
  const [autoApprovedOnce, setAutoApprovedOnce] = useState(false);

  // Hydrate prefs from localStorage on mount.
  useEffect(() => {
    setPrefs(readAutonomy());
  }, []);

  // If the user has flipped to autonomous mode and the quote fits
  // under the ceiling, settle automatically on mount. Gated by a flag
  // so effect changes (rerenders) don't re-fire the approval.
  useEffect(() => {
    if (autoApprovedOnce) return;
    if (shouldAutoApprove(prefs, quote.amount)) {
      const next = {
        ...prefs,
        sessionSpentCents: prefs.sessionSpentCents + quote.amount,
      };
      writeAutonomy(next);
      setPrefs(next);
      setAutoApprovedOnce(true);
      // Mock x402 header — real settlement replaces this in the follow-up.
      onApprove(`x402 mock nonce="${quote.nonce}" amount=${quote.amount}`);
    }
  }, [autoApprovedOnce, prefs, quote.amount, quote.nonce, onApprove]);

  const approveManually = () => {
    const next = {
      ...prefs,
      sessionSpentCents: prefs.sessionSpentCents + quote.amount,
    };
    writeAutonomy(next);
    setPrefs(next);
    onApprove(`x402 mock nonce="${quote.nonce}" amount=${quote.amount}`);
  };

  const toggleAuto = () => {
    const next: AutonomyPrefs = {
      ...prefs,
      mode: prefs.mode === "human" ? "auto" : "human",
    };
    writeAutonomy(next);
    setPrefs(next);
  };

  const budget = formatCents(prefs.sessionMaxCents - prefs.sessionSpentCents);

  return (
    <div
      className="ag-payment-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="life-payment-title"
    >
      <div className="ag-payment-card">
        <div className="eyebrow" style={{ marginBottom: 8 }}>
          Payment required · {projectSlug}
        </div>
        <h2 id="life-payment-title" className="ag-payment-title">
          This run costs {formatCents(quote.amount)}
        </h2>
        <p className="ag-payment-body">
          <strong>{projectSlug}</strong> is a paid project. Approve to settle
          the quote via x402 — the agent will then stream the run into the
          workspace like any other Life project.
        </p>
        <div className="ag-payment-meta">
          <div>
            <span className="mono-label">Rails accepted</span>
            <span className="mono-value">{quote.railsAccepted.join(", ")}</span>
          </div>
          <div>
            <span className="mono-label">Session budget left</span>
            <span className="mono-value">{budget}</span>
          </div>
          <div>
            <span className="mono-label">Nonce</span>
            <span className="mono-value">{quote.nonce.slice(0, 8)}…</span>
          </div>
        </div>
        <div className="ag-payment-actions">
          <button
            type="button"
            className="btn btn--primary"
            onClick={approveManually}
          >
            Approve {formatCents(quote.amount)}
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
        <label className="ag-payment-autonomy">
          <input
            type="checkbox"
            checked={prefs.mode === "auto"}
            onChange={toggleAuto}
          />
          <span>
            Let the agent auto-approve runs under{" "}
            <strong>{formatCents(prefs.autoApproveMaxCents)}</strong> for the
            rest of this session (session cap {formatCents(prefs.sessionMaxCents)}
            )
          </span>
        </label>
      </div>
    </div>
  );
}
