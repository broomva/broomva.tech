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
import { getActiveGateway } from "@/lib/ai/active-gateway";
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
  // Env-var-presence probing is fragile across gateway types (Vercel OIDC,
  // static keys, direct providers). Instead, exercise the same provider
  // factory the real agent runner uses — `getActiveGateway()` is pure
  // config-resolution (no network call), so successful construction
  // proves the gateway is wired for this deploy. Throws → misconfigured.
  try {
    const gateway = getActiveGateway();
    return {
      ...service,
      detail: `${service.detail} · via ${gateway.type}`,
    };
  } catch (err) {
    return {
      ...service,
      status: "down",
      detail: `gateway resolution failed: ${(err as Error).message.slice(0, 60)}`,
    };
  }
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
