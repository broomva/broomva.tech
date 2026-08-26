export type AnalyticsConsent = "accepted" | "essential" | "unknown";

export const ANALYTICS_CONSENT_STORAGE_KEY =
  "broomva.analytics-consent.2026-08-09";

const ANALYTICS_NOTICE_VERSION = "2026-08-09";

export function parseAnalyticsConsent(value: string | null): AnalyticsConsent {
  if (!value) return "unknown";
  try {
    const record = JSON.parse(value) as {
      choice?: string;
      noticeVersion?: string;
    };
    if (
      record.noticeVersion === ANALYTICS_NOTICE_VERSION &&
      (record.choice === "accepted" || record.choice === "essential")
    ) {
      return record.choice;
    }
  } catch {
    return "unknown";
  }
  return "unknown";
}

/**
 * Resolve independent consent stores conservatively. A refusal in either
 * current-version store wins over an acceptance so a stale accepted record
 * cannot reactivate optional analytics after withdrawal.
 */
export function resolveAnalyticsConsent(
  cookieConsent: AnalyticsConsent,
  localConsent: AnalyticsConsent,
): AnalyticsConsent {
  if (cookieConsent === "essential" || localConsent === "essential") {
    return "essential";
  }
  if (cookieConsent === "accepted" || localConsent === "accepted") {
    return "accepted";
  }
  return "unknown";
}

export function serializeAnalyticsConsent(
  choice: Exclude<AnalyticsConsent, "unknown">,
  decidedAt = new Date()
) {
  return JSON.stringify({
    choice,
    noticeVersion: ANALYTICS_NOTICE_VERSION,
    decidedAt: decidedAt.toISOString(),
  });
}
