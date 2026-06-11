import "server-only";

import { createClient } from "redis";

export type RedisHealthStatus = "ok" | "unavailable" | "unconfigured";

export type RedisHealth = {
  status: RedisHealthStatus;
  latency_ms: number;
  /** Logical DB index parsed from the connection URL (0 when unspecified). */
  db: number | null;
  error?: string;
};

const CONNECT_TIMEOUT_MS = 3000;

/**
 * Parse the logical DB index from a redis:// URL path (e.g. `…:6379/2` → 2).
 * Per-environment DB isolation (prod=0, preview=1, dev=2) rides on this path
 * segment, so the health probe surfaces it for verification.
 */
export function parseRedisDb(url: string): number | null {
  try {
    const path = new URL(url).pathname.replace(/^\//, "");
    if (path === "") {
      return 0;
    }
    const n = Number.parseInt(path, 10);
    return Number.isNaN(n) ? null : n;
  } catch {
    return null;
  }
}

/**
 * Probe the configured Redis: connect, PING, report status + latency + DB.
 *
 * Never throws and never leaks the connection string — safe to expose via a
 * health route. `unconfigured` (no REDIS_URL) is a valid graceful mode (the
 * app intentionally falls back to in-memory rate limiting); `unavailable`
 * means a URL is set but unreachable — the real failure this guards against
 * (it was masked for ~85 days by a stale URL pointing at a deleted store).
 */
export async function checkRedisHealth(
  url: string | undefined = process.env.REDIS_URL,
): Promise<RedisHealth> {
  if (!url) {
    return { status: "unconfigured", latency_ms: 0, db: null };
  }

  const db = parseRedisDb(url);
  const client = createClient({
    url,
    socket: { connectTimeout: CONNECT_TIMEOUT_MS, reconnectStrategy: false },
  });
  // A bare error listener prevents an unhandled 'error' from crashing node
  // when the endpoint is unreachable.
  client.on("error", () => {
    // swallowed — surfaced via the catch below
  });

  const start = performance.now();
  try {
    await client.connect();
    const pong = await client.ping();
    const latency_ms = Math.round(performance.now() - start);
    if (pong !== "PONG") {
      return {
        status: "unavailable",
        latency_ms,
        db,
        error: `unexpected PING reply: ${pong}`,
      };
    }
    return { status: "ok", latency_ms, db };
  } catch (error) {
    return {
      status: "unavailable",
      latency_ms: Math.round(performance.now() - start),
      db,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    // destroy() force-closes whether or not connect succeeded.
    try {
      client.destroy();
    } catch {
      // already closed — nothing to do
    }
  }
}
