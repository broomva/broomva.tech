/**
 * Classify one public-asset probe response.
 *
 * Three outcomes, kept distinct on purpose:
 *   - "pass"         the app served the asset (or redirected to its blob store)
 *   - "fail"         the app answered, and the answer is wrong (gated to /login,
 *                    4xx, 5xx, unexpected status)
 *   - "inconclusive" the request never reached the app, so it says nothing about
 *                    the auth proxy this probe exists to check. Two known cases:
 *                      · Vercel Firewall / Bot Protection mitigated it
 *                        (`x-vercel-mitigated: challenge|deny`, usually HTTP 429)
 *                      · the Vercel account is paused or blocked (HTTP 402)
 *
 * Reporting an edge mitigation as a failure turned every PR red on production
 * firewall state (BRO-3833: Bot Protection challenges unauthenticated CI
 * fetches). Reporting it as a pass would hide that the probe did not run.
 * "inconclusive" is neither, and the caller prints it as a warning.
 *
 * @param {{ status: number, location: string, mitigated: string | null,
 *           expectedStatus: (s: number) => boolean, kind: string }} input
 * @returns {{ outcome: "pass" | "fail" | "inconclusive", reason?: string }}
 */
export function classifyProbe({
  status,
  location,
  mitigated,
  expectedStatus,
  kind,
}) {
  // The defining failure mode: the auth proxy treats a public asset as a gated
  // route and sends it to /login. Checked first so nothing can mask it.
  if (location.startsWith("/login") || /\blogin\b/.test(location)) {
    return {
      outcome: "fail",
      reason: "redirects to /login (auth proxy gated a public asset)",
    };
  }

  if (mitigated) {
    return {
      outcome: "inconclusive",
      reason: `Vercel edge mitigation (x-vercel-mitigated: ${mitigated}); the request never reached the app`,
    };
  }

  if (status === 402) {
    return {
      outcome: "inconclusive",
      reason:
        "HTTP 402: the Vercel account is paused or blocked; the request never reached the app",
    };
  }

  if (!expectedStatus(status)) {
    return {
      outcome: "fail",
      reason: `status ${status} not in expected set for ${kind}`,
    };
  }

  return { outcome: "pass" };
}
