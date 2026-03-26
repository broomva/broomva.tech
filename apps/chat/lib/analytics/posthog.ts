/**
 * PostHog server-side client — BRO-204
 *
 * Lazy singleton so the client is only created once per process.
 * Gracefully no-ops if NEXT_PUBLIC_POSTHOG_KEY is not set.
 */

import { PostHog } from "posthog-node";

let _client: PostHog | null = null;

export function getPostHogClient(): PostHog | null {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return null;

  if (!_client) {
    _client = new PostHog(key, {
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com",
      flushAt: 20,
      flushInterval: 5000,
    });
  }
  return _client;
}

/** Server-side event capture — fire-and-forget, safe to call in route handlers and server actions. */
export function captureServerEvent(
  userId: string,
  event: string,
  properties?: Record<string, unknown>,
) {
  const ph = getPostHogClient();
  if (!ph) return;
  ph.capture({ distinctId: userId, event, properties });
}

/** Identify a user with their profile on the server side (e.g. after sign-up). */
export function identifyServerUser(
  userId: string,
  properties: {
    email?: string;
    name?: string;
    plan?: string;
    orgId?: string;
    orgName?: string;
  },
) {
  const ph = getPostHogClient();
  if (!ph) return;
  ph.identify({ distinctId: userId, properties });
  if (properties.orgId) {
    ph.groupIdentify({
      groupType: "organization",
      groupKey: properties.orgId,
      properties: {
        name: properties.orgName,
        plan: properties.plan,
      },
    });
  }
}
