/**
 * GET /api/health/redis
 *
 * Status-only health probe for the Redis the chat surface uses for anonymous
 * rate limiting + resumable streams. Returns `{ status, latency_ms, db }` —
 * never the connection string. Public (status-only, no secrets) so dogfood /
 * uptime checks can read it without a session cookie; registered in
 * proxy.ts PUBLIC_API_PREFIXES under `/api/health`.
 *
 *   200 { status: "ok" }           — connected + PONG
 *   200 { status: "unconfigured" } — no REDIS_URL (intentional in-memory mode)
 *   503 { status: "unavailable" }  — REDIS_URL set but unreachable (real fault)
 */

import { NextResponse } from "next/server";
import { checkRedisHealth } from "@/lib/redis-health";

// Always probe live — a cached health result is worse than useless.
export const dynamic = "force-dynamic";

export async function GET() {
  const health = await checkRedisHealth();
  const httpStatus = health.status === "unavailable" ? 503 : 200;
  return NextResponse.json(health, { status: httpStatus });
}
