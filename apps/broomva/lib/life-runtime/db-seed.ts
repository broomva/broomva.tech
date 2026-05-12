/**
 * Registry → DB bridge for `LifeProject` rows.
 *
 * The canonical project registry (`projects.ts`) is the source of
 * truth for every platform-owned project. The DB row is the
 * operational record (id + stats + ownership). This module keeps
 * them in sync via two strategies:
 *
 *   1. **Lazy upsert (production)** — `ensureProjectRow(slug)` is
 *      called on cache miss in `getProjectBySlug`. If the slug is
 *      in the registry, we upsert a row with platform ownership and
 *      return it. New projects ship by merging a registry edit; the
 *      first user request materializes the DB row.
 *
 *   2. **Eager seed (CLI)** — `seedAllProjects()` upserts every
 *      registry entry. Used by tests + the optional
 *      `bun run scripts/seed-life-projects.ts` script for ops who
 *      want preflight materialization.
 *
 * Both paths use the SAME upsert SQL (`onConflictDoUpdate` on the
 * unique `slug` column), so they're safe to run concurrently.
 */

import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import type { LifeProject } from "@/lib/db/schema";
import { lifeProject } from "@/lib/db/schema";
import {
  getProjectConfig,
  isProjectSlug,
  PROJECT_SLUGS,
  type ProjectConfig,
  type ProjectSlug,
} from "./projects";

/**
 * Idempotently upsert a registry-owned project row. If the slug is
 * not in the registry, returns null (callers must handle 404).
 *
 * Platform-owned projects always have:
 *   - `ownerKind = "platform"`, `ownerId = "platform"`
 *   - `visibility` mirrors the registry's `visibility` field
 *   - `pricing` is rebuilt from the registry's `billing` discriminated union
 *   - `status = "active"` (registry projects are always live)
 *   - `secretsMode = "platform"`
 *
 * Returns the upserted row.
 */
export async function ensureProjectRow(
  slug: string,
): Promise<LifeProject | null> {
  if (!isProjectSlug(slug)) return null;

  const cfg = getProjectConfig(slug);
  const pricing = pricingFromBilling(cfg);

  // Drizzle's `onConflictDoUpdate` with the unique `slug` constraint
  // gives us atomic upsert semantics. The row is created if absent
  // and updated to match registry config if present.
  const [row] = await db
    .insert(lifeProject)
    .values({
      slug: cfg.slug,
      displayName: cfg.displayName,
      description: cfg.description,
      ownerKind: "platform" as const,
      ownerId: "platform",
      moduleTypeId: cfg.moduleTypeId,
      visibility: cfg.visibility,
      pricing: pricing,
      secretsMode: "platform" as const,
      status: "active" as const,
    })
    .onConflictDoUpdate({
      target: lifeProject.slug,
      set: {
        displayName: cfg.displayName,
        description: cfg.description,
        moduleTypeId: cfg.moduleTypeId,
        visibility: cfg.visibility,
        pricing: pricing,
        // Don't overwrite stats / safetyFlags / currentRulesVersionId —
        // those are operational fields owned by the runtime.
        updatedAt: sql`now()`,
      },
    })
    .returning();

  return row ?? null;
}

/**
 * Eager seed — upsert every registry entry. Used by:
 *   - tests (so suite runs against a clean DB)
 *   - `bun run scripts/seed-life-projects.ts` (preflight)
 */
export async function seedAllProjects(): Promise<{
  upserted: ProjectSlug[];
}> {
  const upserted: ProjectSlug[] = [];
  for (const slug of PROJECT_SLUGS) {
    const row = await ensureProjectRow(slug);
    if (row) upserted.push(slug);
  }
  return { upserted };
}

/**
 * Translate the registry's `billing` discriminated union into the
 * `LifeProject.pricing` JSONB shape (legacy schema; the union shape
 * lands in a v2 migration).
 *
 * Schema (per `lifeProject.pricing` doc-comment):
 *   { model: 'per_run'|'per_token'|'tiered'|'free', rail,
 *     consumerPriceCents, maxCostCents, currency }
 */
function pricingFromBilling(
  cfg: ProjectConfig,
): Record<string, unknown> | null {
  switch (cfg.billing.mode) {
    case "free":
      return { model: "free" };
    case "credits":
      return {
        model: "per_run",
        rail: "credits",
        consumerPriceCents: cfg.billing.pricePerRunCents,
        maxCostCents: cfg.billing.pricePerRunCents,
        currency: "USD",
      };
    case "x402":
      return {
        model: "per_run",
        rail: "x402",
        railChainId: cfg.billing.railChainId,
        consumerPriceCents: cfg.billing.pricePerRunCents,
        maxCostCents: cfg.billing.pricePerRunCents,
        currency: "USD",
      };
  }
}

/**
 * Resolve a project: check DB first; on miss, lazy-upsert from the
 * registry; return null if neither path produces a row. Replaces the
 * raw `getProjectBySlug` call site in routes that want auto-seeding.
 */
export async function resolveProjectBySlug(
  slug: string,
): Promise<LifeProject | null> {
  const rows = await db
    .select()
    .from(lifeProject)
    .where(eq(lifeProject.slug, slug))
    .limit(1);
  if (rows[0]) return rows[0];
  return ensureProjectRow(slug);
}
