import { registerOTel } from "@vercel/otel";
import { LangfuseExporter } from "langfuse-vercel";
import { config } from "@/lib/config";

export async function register() {
  // Init Sentry before Langfuse OTel so that sentry.server.config.ts uses
  // skipOpenTelemetrySetup: true and doesn't replace Langfuse's TracerProvider.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }

  registerOTel({
    serviceName: config.appPrefix,
    traceExporter: new LangfuseExporter(),
  });
}
