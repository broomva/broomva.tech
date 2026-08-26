import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Capture 10% of traces in production; 100% in preview/dev
  tracesSampleRate: process.env.VERCEL_ENV === "production" ? 0.1 : 1.0,

  // Error/performance telemetry is treated as an essential security and
  // reliability control. Session replay is deliberately disabled: it can
  // capture prompts, account data, and user-authored content that is not
  // necessary to diagnose an exception.
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
  sendDefaultPii: false,

  debug: false,
});
