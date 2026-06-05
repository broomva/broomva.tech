/**
 * Pure date-bucketing for handoff queue analytics (BRO-1415). Kept in its own
 * module — free of any DB-client / env import — so it is unit-testable without
 * a database connection (importing handoff-queries pulls in the Postgres client
 * + env validation, which the test environment does not have).
 */

/**
 * Build a contiguous N-day window (oldest→newest) from sparse per-day maps.
 * Uses UTC day strings so it lines up with `date_trunc('day', …)` in SQL.
 */
export function densifyDailyBuckets(
  pushedByDay: Map<string, number>,
  completedByDay: Map<string, number>,
  now: Date = new Date(),
  days = 14,
): Array<{ date: string; pushed: number; completed: number }> {
  const out: Array<{ date: string; pushed: number; completed: number }> = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    out.push({
      date: key,
      pushed: pushedByDay.get(key) ?? 0,
      completed: completedByDay.get(key) ?? 0,
    });
  }
  return out;
}
