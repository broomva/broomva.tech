/**
 * GET /api/console/health — aggregated health for all Life Agent OS services
 *
 * Requires authenticated session. Calls /health on arcan, lago, autonomic,
 * haima in parallel, measures latency, returns ConsoleHealth JSON.
 */

import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { getSafeSession } from "@/lib/auth";
import type {
  ConsoleHealth,
  ServiceHealth,
  ServiceStatus,
} from "@/lib/console/types";

const SERVICE_URLS: Record<string, string | undefined> = {
  arcan: process.env.ARCAN_URL,
  lago: process.env.LAGO_URL,
  autonomic: process.env.AUTONOMIC_URL,
  haima: process.env.HAIMA_URL,
};

async function probeService(
  key: string,
  baseUrl: string | undefined
): Promise<ServiceHealth> {
  if (!baseUrl) {
    return { status: "unconfigured" as ServiceStatus, latency_ms: 0 };
  }

  const start = performance.now();
  try {
    const res = await fetch(`${baseUrl}/health`, {
      signal: AbortSignal.timeout(5_000),
      cache: "no-store",
    });
    const latency_ms = Math.round(performance.now() - start);

    if (res.ok) {
      return { status: "healthy", latency_ms };
    }
    return { status: "degraded", latency_ms };
  } catch {
    const latency_ms = Math.round(performance.now() - start);
    return { status: "down", latency_ms };
  }
}

export async function GET() {
  const { data: session } = await getSafeSession({
    fetchOptions: { headers: await headers() },
  });

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const [arcan, lago, autonomic, haima] = await Promise.all([
    probeService("arcan", SERVICE_URLS.arcan),
    probeService("lago", SERVICE_URLS.lago),
    probeService("autonomic", SERVICE_URLS.autonomic),
    probeService("haima", SERVICE_URLS.haima),
  ]);

  const health: ConsoleHealth = {
    arcan,
    lago,
    autonomic,
    haima,
    timestamp: new Date().toISOString(),
  };

  return NextResponse.json(health);
}
