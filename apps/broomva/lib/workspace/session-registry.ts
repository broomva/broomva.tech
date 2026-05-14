import "server-only";

/**
 * Per-user session registry (in-memory). Tracks which session ids a
 * given user has ever opened, so the LeftRail's Sessions sidebar can
 * render them. Resets on server restart; bounded to 50 sessions per
 * user (oldest evicted).
 *
 * v1.1 (Plan E): replaces this with lifegw's Identity.ListSessions
 * RPC backed by Lago persistence. The interface stays the same.
 */

const MAX_SESSIONS_PER_USER = 50;
const USER_SESSIONS = new Map<string, string[]>();

/** Register a session as opened by this user. Idempotent + move-to-front. */
export function registerSession(userId: string, sessionId: string): void {
  let list = USER_SESSIONS.get(userId);
  if (!list) {
    list = [];
    USER_SESSIONS.set(userId, list);
  }
  // Move-to-front if already present; otherwise prepend.
  const idx = list.indexOf(sessionId);
  if (idx >= 0) {
    list.splice(idx, 1);
  }
  list.unshift(sessionId);
  if (list.length > MAX_SESSIONS_PER_USER) {
    list.length = MAX_SESSIONS_PER_USER;
  }
}

/** List a user's session ids, most-recently-touched first. */
export function listSessions(userId: string): string[] {
  return USER_SESSIONS.get(userId)?.slice() ?? [];
}
