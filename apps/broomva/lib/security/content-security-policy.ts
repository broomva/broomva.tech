/**
 * The document Content-Security-Policy, extracted from `next.config.ts` so the
 * directives that third-party embeds depend on can be asserted by a test
 * instead of living as a comment nobody re-reads.
 *
 * Google's Preferred Sources widget is the reason `script-src` and `frame-src`
 * both name `https://news.google.com`. The library is served from that origin
 * and opens its confirmation/toast UI in an iframe on the same origin
 * (`/toastiframe`), and `frame-src` has no fallback of its own here — it would
 * inherit `default-src 'self'` and the dialog would be blocked silently, with
 * the button appearing to do nothing. See
 * `components/site/preferred-source-button.tsx`.
 */

/** Origin serving the Preferred Sources library and its iframe UI. */
export const GOOGLE_PREFERRED_SOURCES_ORIGIN = "https://news.google.com";

const productionScriptSources = [
  "'self'",
  "'unsafe-inline'",
  "https://va.vercel-scripts.com",
  GOOGLE_PREFERRED_SOURCES_ORIGIN,
];

export function buildContentSecurityPolicy(
  nodeEnv: string | undefined = process.env.NODE_ENV,
): string {
  const isProduction = nodeEnv === "production";

  const scriptSources = isProduction
    ? productionScriptSources
    : [...productionScriptSources, "'unsafe-eval'", "https://unpkg.com"];

  return [
    "default-src 'self'",
    `script-src ${scriptSources.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https: wss:",
    `frame-src 'self' ${GOOGLE_PREFERRED_SOURCES_ORIGIN}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
    "form-action 'self' https://checkout.stripe.com",
    ...(isProduction ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}
