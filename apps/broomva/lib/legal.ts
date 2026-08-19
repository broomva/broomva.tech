export const TERMS_VERSION = "2026-08-09";
export const PRIVACY_VERSION = "2026-08-09";
// Updated 2026-08-19 (BRO-2184): punctuation-only copy edits on /terms and /privacy (em dashes →
// parentheses / middle dots) — no legally material change, so TERMS_VERSION / PRIVACY_VERSION are
// deliberately NOT bumped and no re-acceptance is forced. Flagged in the PR for legal confirmation.
// SHA-256 of the policy component source plus the legally material config
// manifest defined in legal.test.ts. This catches rendered-policy drift without
// forcing reacceptance for unrelated model or UI configuration changes.
export const TERMS_CONTENT_SHA256 =
  "db86a31e2ee62e6e4976ae5c183b6b9eb71f77c875ef8ce9584c9ae81e407bd1";
export const PRIVACY_CONTENT_SHA256 =
  "4e459447cd32abd248b3e9a67029ea793403de5b0894a35deab6522fd6add9b4";
