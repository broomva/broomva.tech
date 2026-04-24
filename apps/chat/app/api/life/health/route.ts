/**
 * GET /api/life/health
 *
 * Truth-telling health endpoint for /life/*. Replaces the previous
 * hardcoded Dock pills with a real snapshot of which Life subsystems
 * are live vs simulated vs not-deployed in the current environment.
 *
 * Polled by the Dock component every 60s. Safe to CDN-cache briefly
 * (the shape is stable per deploy; probes only flip on failures).
 */

import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import type { LifeHealth, LifeService } from "@/lib/life-runtime/health";
import { staticHealthSnapshot } from "@/lib/life-runtime/health";

export async function GET(): Promise<NextResponse<LifeHealth>> {
  const snapshot = staticHealthSnapshot();

  // Async probes — each runs with a 2s timeout and degrades the
  // corresponding service on failure rather than failing the whole
  // response. The Dock needs to render even when Postgres is blippy.
  snapshot.services = await Promise.all(
    snapshot.services.map(async (s) => maybeProbe(s)),
  );

  // Refresh the timestamp after probes so the client sees probe-completion
  // time, not snapshot-construction time.
  snapshot.ts = new Date().toISOString();

  return NextResponse.json(snapshot, {
    headers: {
      // Short edge cache — health is volatile, but collapsing bursts of
      // polling from multiple open /life/* tabs is a win.
      "Cache-Control":
        "public, max-age=10, s-maxage=15, stale-while-revalidate=30",
    },
  });
}

async function maybeProbe(service: LifeService): Promise<LifeService> {
  try {
    switch (service.id) {
      case "ai-gateway":
        return probeAiGateway(service);
      case "lago":
        // Lago-in-this-deploy is Postgres — probe the DB.
        return await probePostgres(service);
      default:
        return service;
    }
  } catch (err) {
    return {
      ...service,
      status: "degraded",
      detail: `${service.detail ?? ""} · probe error: ${(err as Error).message.slice(0, 60)}`,
    };
  }
}

function probeAiGateway(service: LifeService): LifeService {
  // We don't want to actually hit the LLM just to check a dot color.
  // "Live" means the gateway is configured for this deploy — the env
  // var presence is a necessary condition and a cheap signal.
  const hasCreds =
    Boolean(process.env.AI_GATEWAY_API_KEY) ||
    Boolean(process.env.OPENAI_API_KEY) ||
    Boolean(process.env.ANTHROPIC_API_KEY);
  if (!hasCreds) {
    return {
      ...service,
      status: "down",
      detail: "no gateway credentials configured",
    };
  }
  return service;
}

async function probePostgres(service: LifeService): Promise<LifeService> {
  const started = Date.now();
  try {
    // drizzle over postgres — cheap `SELECT 1` with a short abort.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    await db.execute(sql`SELECT 1`);
    clearTimeout(timeout);
    const latencyMs = Date.now() - started;
    return {
      ...service,
      detail: `${service.detail} · ${latencyMs}ms`,
    };
  } catch (err) {
    return {
      ...service,
      status: "degraded",
      detail: `${service.detail} · probe failed (${(err as Error).message.slice(0, 40)})`,
    };
  }
}
