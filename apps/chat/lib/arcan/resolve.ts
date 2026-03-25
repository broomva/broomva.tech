/**
 * Resolve the Arcan URL for a given user (BRO-225).
 *
 * Priority:
 * 1. User's organization has a running Life instance on Railway → use its arcanUrl
 * 2. ARCAN_URL env var (local dev / shared instance)
 * 3. null (no Arcan available — fall back to direct streamText)
 *
 * Two-tier resolution is exposed via `resolveArcanEndpoints` so callers can
 * attempt the dedicated instance first, then fall back to the shared instance
 * if the dedicated one is unhealthy.
 */

import "server-only";

import { eq } from "drizzle-orm";
import { db as tierDb } from "@/lib/db/client";
import {
  organizationMember,
  organizationLifeInstance,
} from "@/lib/db/schema";

export interface ArcanEndpoints {
  arcanUrl: string;
  lagoUrl: string | null;
  /** True when this URL points to a dedicated Railway org instance. */
  isDedicated: boolean;
  /** Organization ID that owns the dedicated instance, or null for the shared instance. */
  orgId: string | null;
}

/**
 * Resolve both the dedicated and shared Arcan endpoints for a user.
 *
 * - `dedicated` is the org's Railway Life instance URL (if running or degraded).
 * - `shared` is the env-var fallback (ARCAN_URL), or null if not configured.
 *
 * Callers should try `dedicated` first. If unreachable, fall back to `shared`
 * and call `markInstanceDegraded(orgId)` to record the health event.
 */
export async function resolveArcanEndpoints(userId: string): Promise<{
  dedicated: ArcanEndpoints | null;
  shared: ArcanEndpoints | null;
}> {
  let dedicated: ArcanEndpoints | null = null;

  try {
    const rows = await tierDb
      .select({
        id: organizationLifeInstance.id,
        orgId: organizationLifeInstance.organizationId,
        arcanUrl: organizationLifeInstance.arcanUrl,
        lagoUrl: organizationLifeInstance.lagoUrl,
        status: organizationLifeInstance.status,
      })
      .from(organizationLifeInstance)
      .innerJoin(
        organizationMember,
        eq(
          organizationMember.organizationId,
          organizationLifeInstance.organizationId
        )
      )
      .where(eq(organizationMember.userId, userId))
      .limit(1);

    const instance = rows[0];
    if (
      instance?.arcanUrl &&
      (instance.status === "running" || instance.status === "degraded")
    ) {
      dedicated = {
        arcanUrl: instance.arcanUrl,
        lagoUrl: instance.lagoUrl ?? null,
        isDedicated: true,
        orgId: instance.orgId,
      };
    }
  } catch {
    // DB query failed — fall through to shared instance
  }

  const envUrl = process.env.ARCAN_URL;
  const shared: ArcanEndpoints | null = envUrl
    ? {
        arcanUrl: envUrl,
        lagoUrl: process.env.LAGO_URL ?? null,
        isDedicated: false,
        orgId: null,
      }
    : null;

  return { dedicated, shared };
}

/**
 * Mark a Life instance as degraded when its arcand fails a health check.
 *
 * The degraded state is visible in the admin dashboard and triggers a
 * notification to the tenant admin (BRO-225 acceptance criterion).
 */
export async function markInstanceDegraded(orgId: string): Promise<void> {
  try {
    await tierDb
      .update(organizationLifeInstance)
      .set({ status: "degraded", lastHealthCheck: new Date() })
      .where(eq(organizationLifeInstance.organizationId, orgId));
  } catch {
    // Non-fatal — degradation marking is best-effort
  }
}

/**
 * Look up the Arcan URL for an authenticated user.
 *
 * @deprecated Prefer `resolveArcanEndpoints` for two-tier fallback support.
 * This wrapper exists for call sites that only need a single resolved URL.
 */
export async function resolveArcanUrl(
  userId: string
): Promise<{ arcanUrl: string; lagoUrl: string | null } | null> {
  const { dedicated, shared } = await resolveArcanEndpoints(userId);
  const endpoint = dedicated ?? shared;
  if (!endpoint) return null;
  return { arcanUrl: endpoint.arcanUrl, lagoUrl: endpoint.lagoUrl };
}
