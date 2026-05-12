/**
 * Relay Redis client — module-level singleton for connection reuse.
 *
 * All relay API routes share this client instead of creating per-request
 * connections. The pub/sub subscriber for SSE streams still needs its own
 * dedicated connection (Redis requires a separate connection in subscribe
 * mode), but command/event routes reuse the shared client.
 */
import { createClient } from "redis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

type RedisClient = ReturnType<typeof createClient>;

let _client: RedisClient | null = null;
let _connecting: Promise<RedisClient> | null = null;

/**
 * Returns a shared Redis client. Lazily connects on first call.
 * Safe to call from multiple routes concurrently — only one connection
 * is created.
 */
export async function getRelayRedis(): Promise<RedisClient> {
  if (_client?.isReady) return _client;

  if (_connecting) {
    return _connecting;
  }

  const client = createClient({ url: REDIS_URL });

  client.on("error", (err) => {
    console.error("[relay/redis] Connection error:", err);
  });

  client.on("end", () => {
    _client = null;
    _connecting = null;
  });

  _connecting = client.connect().then(() => {
    _client = client;
    _connecting = null;
    return client;
  });

  return _connecting;
}

/**
 * Creates a dedicated Redis client for pub/sub subscribers.
 * Each SSE stream needs its own connection because Redis requires
 * a dedicated connection once in subscribe mode.
 */
export function createSubscriberClient(): RedisClient {
  return createClient({ url: REDIS_URL });
}
