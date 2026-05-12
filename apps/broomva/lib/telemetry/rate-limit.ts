import "server-only";
import { getClientIP } from "@/lib/utils/rate-limit";

// In-memory token bucket — fine for single-region. Upgrade to Upstash
// for multi-region (noted in spec § 8). The shape mirrors the existing
// device-code rate limiter in lib/utils/rate-limit.ts so a future
// refactor to a shared primitive is cheap.

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();
let lastCleanup = Date.now();
const CLEANUP_INTERVAL_MS = 60_000;

function cleanup(now: number) {
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [k, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(k);
  }
}

export type TelemetryRateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
};

function check(
  key: string,
  limit: number,
  windowMs: number,
): TelemetryRateLimitResult {
  const now = Date.now();
  cleanup(now);
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: limit - 1, resetAt };
  }
  bucket.count += 1;
  return {
    allowed: bucket.count <= limit,
    remaining: Math.max(0, limit - bucket.count),
    resetAt: bucket.resetAt,
  };
}

/**
 * 60 writes/min per IP for anonymous telemetry. 600 writes/min per user
 * for authenticated. Reset window is exactly 60_000ms from the first
 * call in a window.
 */
export function checkTelemetryRateLimit(opts: {
  request: Request;
  userId: string | null;
}): TelemetryRateLimitResult {
  if (opts.userId) {
    return check(`tel:u:${opts.userId}`, 600, 60_000);
  }
  const ip = getClientIP(opts.request as Request & { ip?: string });
  return check(`tel:ip:${ip}`, 60, 60_000);
}
