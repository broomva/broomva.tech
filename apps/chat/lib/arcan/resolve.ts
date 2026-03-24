/**
 * Resolve the Arcan URL for a given user.
 *
 * Priority:
 * 1. User's organization has a running Life instance on Railway → use its arcanUrl
 * 2. ARCAN_URL env var (local dev / shared instance)
 * 3. null (no Arcan available — fall back to direct streamText)
 */

import "server-only";

import { eq } from "drizzle-orm";
import { db as tierDb } from "@/lib/db/client";
import {
  organization,
  organizationMember,
  organizationLifeInstance,
} from "@/lib/db/schema";

export interface ArcanEndpoints {
  arcanUrl: string;
  lagoUrl: string | null;
}

/**
 * Look up the Arcan URL for an authenticated user.
 * Returns null if no Arcan instance is available.
 */
export async function resolveArcanUrl(
  userId: string
): Promise<ArcanEndpoints | null> {
  // 1. Check org Life instance (Railway deployment)
  try {
    const rows = await tierDb
      .select({
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
      return {
        arcanUrl: instance.arcanUrl,
        lagoUrl: instance.lagoUrl ?? null,
      };
    }
  } catch {
    // DB query failed — fall through to env
  }

  // 2. Env-based fallback (local dev or shared instance)
  const envUrl = process.env.ARCAN_URL;
  if (envUrl) {
    return {
      arcanUrl: envUrl,
      lagoUrl: process.env.LAGO_URL ?? null,
    };
  }

  // 3. No Arcan available
  return null;
}
