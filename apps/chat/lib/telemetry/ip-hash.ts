import "server-only";
import { createHash } from "node:crypto";

/**
 * Returns the daily salt string for a given moment. The salt is just the
 * UTC date stamp prefixed with the env `IP_HASH_SALT` (or a constant if
 * the env is unset, since we never want hashes to crash a write — they
 * just become less unique).
 *
 * Callers should NOT cache the result across calls; it's cheap and the
 * rotation point matters more than micro-perf.
 */
export function currentDailySalt(now: Date = new Date()): string {
  const day = now.toISOString().slice(0, 10);
  const root = process.env.IP_HASH_SALT ?? "broomva-ip-hash-default";
  return `${root}:${day}`;
}

/**
 * SHA-256 hash of `(ip + salt)`, truncated to 64 hex chars. Returns an
 * empty string for an empty IP — callers should never call this with
 * untrusted input, but we don't want to crash on it either.
 */
export function hashIp(
  ip: string,
  saltOrDay: string = currentDailySalt(),
): string {
  if (!ip) return "";
  // `saltOrDay` is either a salt string from `currentDailySalt()` or a
  // bare YYYY-MM-DD for tests. Both behave the same — only stable string
  // identity matters.
  const h = createHash("sha256");
  h.update(`${ip}|${saltOrDay}`);
  return h.digest("hex");
}
