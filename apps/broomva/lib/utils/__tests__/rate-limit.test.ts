// Unit tests for the rate-limiter's "is Redis actually wired?" decision logic.
//
// These are deterministic (a fake in-memory Redis double — no network) and
// pin the two behaviours that the 85-day stale-URL outage silently broke:
//   1. With a working client, counters are written to Redis (durable, shared
//      across serverless instances) — the path that makes the limit real.
//   2. With no client OR a throwing client, it falls back to in-memory and
//      never throws — graceful degradation, not a 500.
// The live end-to-end wire (real connect + DB isolation) is covered by
// redis-wiring.integration.test.ts.

import { afterEach, describe, expect, it, vi } from "vitest";
import { config } from "@/lib/config";
import { ANONYMOUS_LIMITS } from "@/lib/types/anonymous";
import { checkAnonymousRateLimit } from "@/lib/utils/rate-limit";

// rate-limit.ts is server-only; neutralize the guard for the test runtime
// (same pattern as the chat route test).
vi.mock("server-only", () => ({}));

/** Minimal node-redis double: only the commands checkRateLimit calls. */
function makeFakeRedis() {
  const store = new Map<string, number>();
  return {
    store,
    get: vi.fn(async (k: string) => {
      const v = store.get(k);
      return v === undefined ? null : String(v);
    }),
    incr: vi.fn(async (k: string) => {
      const v = (store.get(k) ?? 0) + 1;
      store.set(k, v);
      return v;
    }),
    expire: vi.fn(async () => true),
  };
}

const IP = "203.0.113.7";
const MINUTE_KEY = `${config.appPrefix}:rate-limit:minute:${IP}`;
const MONTH_KEY = `${config.appPrefix}:rate-limit:month:${IP}`;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("checkAnonymousRateLimit — Redis wiring", () => {
  it("writes durable counters to Redis on the happy path", async () => {
    const redis = makeFakeRedis();

    const result = await checkAnonymousRateLimit(IP, redis);

    expect(result.success).toBe(true);
    // The counter lives in Redis (shared across instances), not process memory.
    expect(redis.incr).toHaveBeenCalledWith(MINUTE_KEY);
    expect(redis.incr).toHaveBeenCalledWith(MONTH_KEY);
    expect(redis.store.get(MINUTE_KEY)).toBe(1);
    expect(redis.store.get(MONTH_KEY)).toBe(1);
    // First increment in a window sets the expiry (window roll-over).
    expect(redis.expire).toHaveBeenCalled();
  });

  it("blocks once the per-minute counter exceeds the limit", async () => {
    const redis = makeFakeRedis();
    const limit = ANONYMOUS_LIMITS.RATE_LIMIT.REQUESTS_PER_MINUTE;

    // Exhaust exactly the allowance.
    for (let i = 0; i < limit; i++) {
      const ok = await checkAnonymousRateLimit(IP, redis);
      expect(ok.success).toBe(true);
    }

    // One past the limit → blocked, with rate-limit headers.
    const blocked = await checkAnonymousRateLimit(IP, redis);
    expect(blocked.success).toBe(false);
    expect(blocked.headers?.["X-RateLimit-Remaining"]).toBe("0");
    expect(redis.store.get(MINUTE_KEY)).toBe(limit + 1);
  });

  it("falls back to in-memory (no throw) when no client is supplied", async () => {
    const result = await checkAnonymousRateLimit(IP, null);
    // Graceful degradation — the request still succeeds, just non-durable.
    expect(result.success).toBe(true);
  });

  it("falls back to in-memory when the Redis client throws", async () => {
    const redis = makeFakeRedis();
    redis.incr.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const result = await checkAnonymousRateLimit(IP, redis);
    expect(result.success).toBe(true);
  });
});
