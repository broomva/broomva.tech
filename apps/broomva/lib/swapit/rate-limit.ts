import "server-only";

import { getClientIP } from "@/lib/utils/rate-limit";

/**
 * Write-path rate limiting for the public swapit commons (`POST /api/swapit/facts`).
 *
 * In-memory token bucket, mirroring `lib/telemetry/rate-limit.ts` but with its own
 * keyspace so it never competes with the telemetry beacon budget. Single-region; the
 * shape matches the telemetry limiter so a future refactor to a shared primitive is
 * cheap (see that file's note). Corroboration already blunts *content* spam — a lone
 * IP can't approve a fact, and identical resubmissions only bump a counter — so this
 * guards the raw DB-write rate, not the knowledge graph's integrity.
 */

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();
let lastCleanup = Date.now();
const CLEANUP_INTERVAL_MS = 60_000;

function cleanup(now: number) {
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) {
    return;
  }
  lastCleanup = now;
  for (const [k, b] of buckets) {
    if (b.resetAt <= now) {
      buckets.delete(k);
    }
  }
}

export type SwapitRateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
};

function check(
  key: string,
  limit: number,
  windowMs: number,
): SwapitRateLimitResult {
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

// Generous enough for a legitimate batch `swapit sync` (a user pushing a region's
// worth of offers in one go), bounded against raw write floods from a single source.
const ANON_WRITES_PER_MIN = 60;
const USER_WRITES_PER_MIN = 600;
const WINDOW_MS = 60_000;

/** Per-IP (anonymous) / per-user (authenticated) write rate for `POST /api/swapit/facts`. */
export function checkSwapitWriteRateLimit(opts: {
  request: Request;
  userId: string | null;
}): SwapitRateLimitResult {
  if (opts.userId) {
    return check(`swapit:u:${opts.userId}`, USER_WRITES_PER_MIN, WINDOW_MS);
  }
  const ip = getClientIP(opts.request as Request & { ip?: string });
  return check(`swapit:ip:${ip}`, ANON_WRITES_PER_MIN, WINDOW_MS);
}

/** Test-only: clear the in-memory buckets between cases. */
export function __resetSwapitRateLimit() {
  buckets.clear();
  lastCleanup = Date.now();
}
