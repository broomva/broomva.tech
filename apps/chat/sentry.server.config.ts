import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  tracesSampleRate: process.env.VERCEL_ENV === "production" ? 0.1 : 1.0,

  // REQUIRED: prevents Sentry from replacing the OTel TracerProvider
  // that Langfuse sets up via registerOTel() in instrumentation.ts.
  skipOpenTelemetrySetup: true,

  debug: false,
});
