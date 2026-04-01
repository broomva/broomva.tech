/**
 * Feature flags — BRO-207 (server-only)
 *
 * Runtime feature flags backed by PostHog with fallback to chat.config.ts.
 * PostHog flag names map 1:1 to the keys below.
 * Plan-tier targeting is configured in the PostHog dashboard using the
 * 'organization' group property 'plan'.
 *
 * Client components should import from feature-flags-shared.ts instead.
 */

import { PostHog } from "posthog-node";
import { getStaticFeatureFlag } from "./feature-flags-shared";

// Re-export shared types and helpers so server-side callers can use a single import
export type { FeatureFlag } from "./feature-flags-shared";
export { getStaticFeatureFlag } from "./feature-flags-shared";

// ── Server-side client ────────────────────────────────────────────────────────

let _ph: PostHog | null = null;

function getServerPostHog(): PostHog | null {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return null;
  if (!_ph) {
    _ph = new PostHog(key, {
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
      flushAt: 1,
      flushInterval: 0,
    });
  }
  return _ph;
}

// ── Server helper ─────────────────────────────────────────────────────────────

/**
 * Evaluate a feature flag server-side for a given user.
 * Falls back to the static config value if PostHog is unavailable or errors.
 *
 * @param flag  - Feature flag key
 * @param userId - PostHog distinct ID (user.id or anonymous ID)
 * @param groups - Optional group memberships, e.g. { organization: orgId }
 */
export async function getServerFeatureFlag(
  flag: Parameters<typeof getStaticFeatureFlag>[0],
  userId: string,
  groups?: Record<string, string>,
): Promise<boolean> {
  const ph = getServerPostHog();
  if (!ph) return getStaticFeatureFlag(flag);

  try {
    const enabled = await ph.isFeatureEnabled(flag, userId, { groups });
    return enabled ?? getStaticFeatureFlag(flag);
  } catch {
    return getStaticFeatureFlag(flag);
  }
}
