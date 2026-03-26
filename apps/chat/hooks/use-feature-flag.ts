"use client";

/**
 * useFeatureFlag — BRO-207
 *
 * Client-side feature flag hook backed by PostHog with fallback to
 * the static config values from chat.config.ts.
 */

import { useFeatureFlagEnabled } from "posthog-js/react";
import type { FeatureFlag } from "@/lib/feature-flags";
import { getStaticFeatureFlag } from "@/lib/feature-flags";

/**
 * Returns true if the feature flag is enabled for the current user.
 * Falls back to the static config value while PostHog is loading or
 * when PostHog is not configured.
 *
 * @example
 * const hasMarketplace = useFeatureFlag("marketplace_enabled");
 */
export function useFeatureFlag(flag: FeatureFlag): boolean {
  // posthog-js returns undefined while bootstrapping, then true/false/null
  const phValue = useFeatureFlagEnabled(flag);

  if (phValue === undefined || phValue === null) {
    return getStaticFeatureFlag(flag);
  }

  return phValue;
}
