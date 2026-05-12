// Autonomy preferences — governs whether the human reviews each payment
// or the agent settles autonomously up to a spend ceiling.
//
// Default posture is "review every payment" so no surprise charges. A
// power-user can flip to "auto-approve under $X/run" and the UI will
// settle the quote without a modal prompt as long as the agent stays
// under the ceiling.
//
// Persisted in localStorage under `life.autonomy.v1`. Server-side
// settlement (Haima balance / x402 wallet) is the follow-up PR; this
// client-only layer is the contract the future settlement layer will
// consume.

"use client";

const STORAGE_KEY = "life.autonomy.v1";

export interface AutonomyPrefs {
  /**
   * "human" — every paid run requires explicit approval in the UI.
   * "auto" — the client auto-approves runs under `autoApproveMaxCents`.
   */
  mode: "human" | "auto";
  /** Per-run ceiling for auto-approve mode (USD cents). Default $1.00. */
  autoApproveMaxCents: number;
  /** Per-session spend cap — agent refuses to settle beyond this. Default $5.00. */
  sessionMaxCents: number;
  /** Running tally of spend since the session started (cents). */
  sessionSpentCents: number;
}

export const DEFAULT_AUTONOMY: AutonomyPrefs = {
  mode: "human",
  autoApproveMaxCents: 100, // $1.00
  sessionMaxCents: 500, // $5.00
  sessionSpentCents: 0,
};

export function readAutonomy(): AutonomyPrefs {
  if (typeof window === "undefined") return DEFAULT_AUTONOMY;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_AUTONOMY;
    const parsed = JSON.parse(raw) as Partial<AutonomyPrefs>;
    return {
      mode: parsed.mode === "auto" ? "auto" : "human",
      autoApproveMaxCents: Number(
        parsed.autoApproveMaxCents ?? DEFAULT_AUTONOMY.autoApproveMaxCents,
      ),
      sessionMaxCents: Number(
        parsed.sessionMaxCents ?? DEFAULT_AUTONOMY.sessionMaxCents,
      ),
      sessionSpentCents: Number(
        parsed.sessionSpentCents ?? DEFAULT_AUTONOMY.sessionSpentCents,
      ),
    };
  } catch {
    return DEFAULT_AUTONOMY;
  }
}

export function writeAutonomy(prefs: AutonomyPrefs): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // ignore quota / privacy-mode errors
  }
}

/**
 * Decide whether the client should auto-approve a quote or prompt the human.
 * Pure function — caller is responsible for updating sessionSpentCents.
 */
export function shouldAutoApprove(
  prefs: AutonomyPrefs,
  quotedCents: number,
): boolean {
  if (prefs.mode !== "auto") return false;
  if (quotedCents > prefs.autoApproveMaxCents) return false;
  if (prefs.sessionSpentCents + quotedCents > prefs.sessionMaxCents)
    return false;
  return true;
}

/** Format cents as a localized USD string for UI labels. */
export function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents < 100 ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}
