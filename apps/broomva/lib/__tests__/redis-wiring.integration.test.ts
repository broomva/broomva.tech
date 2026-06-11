// End-to-end Redis wiring test — runs against a REAL Redis whenever REDIS_URL
// is set (CI provides a `redis:8` service on db15; locally point it at the
// Railway instance's db15). Skipped otherwise so the unit suite stays
// hermetic. This is the test that "checks the whole setup is wired": env var
// → client → connect → PING → per-environment logical-DB isolation.

import { createClient } from "redis";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { checkRedisHealth, parseRedisDb } from "@/lib/redis-health";
import { checkAnonymousRateLimit } from "@/lib/utils/rate-limit";

// redis-health.ts / rate-limit.ts are server-only; neutralize the guard.
vi.mock("server-only", () => ({}));

const REDIS_URL = process.env.REDIS_URL;

/** Rewrite the logical-DB segment of a redis:// URL (the isolation knob). */
function withDb(url: string, db: number): string {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
}

type Client = ReturnType<typeof createClient>;

// `describe.skipIf` keeps the unit run green with no Redis present.
describe.skipIf(!REDIS_URL)("Redis wiring (integration)", () => {
  const url = REDIS_URL as string;
  const configuredDb = parseRedisDb(url) ?? 0;
  const otherDb = configuredDb === 0 ? 1 : configuredDb - 1;
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  let primary: Client;
  let neighbour: Client;

  beforeAll(async () => {
    primary = createClient({ url, socket: { reconnectStrategy: false } });
    neighbour = createClient({
      url: withDb(url, otherDb),
      socket: { reconnectStrategy: false },
    });
    primary.on("error", () => undefined);
    neighbour.on("error", () => undefined);
    await Promise.all([primary.connect(), neighbour.connect()]);
  });

  afterAll(async () => {
    await primary?.destroy();
    await neighbour?.destroy();
  });

  it("connects and answers PING", async () => {
    expect(await primary.ping()).toBe("PONG");
  });

  it("checkRedisHealth reports ok with the configured DB", async () => {
    const health = await checkRedisHealth(url);
    expect(health.status).toBe("ok");
    expect(health.db).toBe(configuredDb);
    expect(health.latency_ms).toBeGreaterThanOrEqual(0);
  });

  it("isolates keyspaces across logical DBs (per-environment isolation)", async () => {
    const key = `wiringtest:iso:${stamp}`;
    try {
      await primary.set(key, "present", { EX: 30 });
      // Same key, neighbouring DB index → must NOT see it.
      expect(await neighbour.get(key)).toBeNull();
      // Sanity: it IS visible in its own DB.
      expect(await primary.get(key)).toBe("present");
    } finally {
      await primary.del(key);
    }
  });

  it("writes a durable rate-limit counter through the real client", async () => {
    const ip = `198.51.100.${Math.floor(Math.random() * 254) + 1}-${stamp}`;
    const minuteKey = `broomva:rate-limit:minute:${ip}`;
    const monthKey = `broomva:rate-limit:month:${ip}`;
    try {
      const result = await checkAnonymousRateLimit(ip, primary);
      expect(result.success).toBe(true);
      // The counter is in Redis — durable across serverless instances.
      expect(await primary.get(minuteKey)).toBe("1");
    } finally {
      await primary.del(minuteKey);
      await primary.del(monthKey);
    }
  });
});
