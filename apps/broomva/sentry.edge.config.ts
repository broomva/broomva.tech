import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  tracesSampleRate: process.env.VERCEL_ENV === "production" ? 0.1 : 1.0,

  // skipOpenTelemetrySetup not needed on edge (no Langfuse there)
  debug: false,
});
