/**
 * Life Runtime — database queries for projects, rules versions, runs, events.
 * Thin wrappers over Drizzle so the API route stays business-logic-focused.
 */

import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  lifeProject,
  lifeReservedSlug,
  lifeRulesVersion,
  lifeRun,
  lifeRunEvent,
  type LifeProject,
  type LifeRulesVersion,
  type LifeRun,
} from "@/lib/db/schema";
import type { ConsumerKind, PaymentMode } from "./types";

/**
 * Load a project by its URL slug. Returns null if not found.
 *
 * Note: this does NOT load the rules version — fetch that separately via
 * getRulesVersion(projectId, versionId?) to avoid wasted JSONB reads on
 * the listing surfaces.
 */
export async function getProjectBySlug(slug: string): Promise<LifeProject | null> {
  const rows = await db
    .select()
    .from(lifeProject)
    .where(eq(lifeProject.slug, slug))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Load the currentRulesVersion for a project. If the project has no
 * currentRulesVersionId pointer yet (draft project), returns null.
 */
export async function getCurrentRulesVersion(
  project: LifeProject,
): Promise<LifeRulesVersion | null> {
  if (!project.currentRulesVersionId) return null;
  const rows = await db
    .select()
    .from(lifeRulesVersion)
    .where(eq(lifeRulesVersion.id, project.currentRulesVersionId))
    .limit(1);
  return rows[0] ?? null;
}

/** Check whether a slug is reserved. Used by the project creation wizard. */
export async function isReservedSlug(slug: string): Promise<boolean> {
  const rows = await db
    .select({ slug: lifeReservedSlug.slug })
    .from(lifeReservedSlug)
    .where(eq(lifeReservedSlug.slug, slug))
    .limit(1);
  return rows.length > 0;
}

export interface CreateRunParams {
  projectId: string;
  /** May be null when project has no rulesVersion yet (generic-runner smoke). */
  rulesVersionId: string | null;
  consumerKind: ConsumerKind;
  consumerId: string;
  organizationId?: string;
  input: unknown;
  paymentMode: PaymentMode;
}

/**
 * Insert a new LifeRun row in "streaming" status.
 * A stub rulesVersionId is injected when the project has no HEAD yet so the
 * column's not-null constraint holds; the row documents which version (or
 * lack thereof) produced the run.
 */
export async function createRun(params: CreateRunParams): Promise<LifeRun> {
  // The DB schema enforces rulesVersionId NOT NULL. For platform-seeded
  // projects we create an "initial" rules version lazily so the constraint
  // passes on the first run without extra migration work.
  const effectiveRulesVersionId = params.rulesVersionId
    ?? (await ensureInitialRulesVersion(params.projectId, params.consumerId));

  // LifeRun.input is JSONB NOT NULL — coerce nullish callers to an empty
  // object so "start a run with no structured input" is always legal.
  const inputValue = (params.input ?? {}) as object;

  const [row] = await db
    .insert(lifeRun)
    .values({
      projectId: params.projectId,
      rulesVersionId: effectiveRulesVersionId,
      consumerKind: params.consumerKind,
      consumerId: params.consumerId,
      organizationId: params.organizationId ?? null,
      input: inputValue,
      status: "streaming",
      paymentMode: params.paymentMode,
      startedAt: new Date(),
    })
    .returning();

  if (!row) {
    throw new Error("createRun: insert returned no row");
  }
  return row;
}

/**
 * Create and point-to a placeholder rules version if the project has none yet.
 * The rulesJson is `{}` — actual rules land when the project is authored via
 * the wizard. This keeps the NOT NULL constraint on LifeRun.rulesVersionId
 * satisfied for platform-seeded demos.
 */
async function ensureInitialRulesVersion(
  projectId: string,
  actingUserId: string,
): Promise<string> {
  const project = await db
    .select()
    .from(lifeProject)
    .where(eq(lifeProject.id, projectId))
    .limit(1);

  if (project[0]?.currentRulesVersionId) {
    return project[0].currentRulesVersionId;
  }

  const [version] = await db
    .insert(lifeRulesVersion)
    .values({
      projectId,
      rulesJson: {},
      semver: "0.0.0",
      createdByUserId: actingUserId,
    })
    .returning();

  if (!version) {
    throw new Error("ensureInitialRulesVersion: insert returned no row");
  }

  await db
    .update(lifeProject)
    .set({ currentRulesVersionId: version.id })
    .where(eq(lifeProject.id, projectId));

  return version.id;
}

export interface FinishRunParams {
  runId: string;
  status: "succeeded" | "failed" | "cancelled";
  output?: unknown;
  errorReason?: string;
  llmCostCents?: number;
  platformFeeCents?: number;
  creatorFeeCents?: number;
  consumerPaidCents?: number;
  model?: string;
  provider?: string;
}

export async function finishRun(params: FinishRunParams): Promise<void> {
  await db
    .update(lifeRun)
    .set({
      status: params.status,
      output: (params.output as object | undefined) ?? null,
      errorReason: params.errorReason ?? null,
      llmCostCents: params.llmCostCents ?? 0,
      platformFeeCents: params.platformFeeCents ?? 0,
      creatorFeeCents: params.creatorFeeCents ?? 0,
      consumerPaidCents: params.consumerPaidCents ?? 0,
      model: params.model ?? null,
      provider: params.provider ?? null,
      finishedAt: new Date(),
    })
    .where(eq(lifeRun.id, params.runId));
}

/**
 * Append an event to a run. `seq` is monotonic within a run and must be
 * supplied by the caller so replays are deterministic.
 */
export async function appendRunEvent(
  runId: string,
  seq: number,
  type: string,
  payload: Record<string, unknown> = {},
): Promise<void> {
  await db.insert(lifeRunEvent).values({
    runId,
    seq,
    type,
    payload,
  });
}

export async function getRunEvents(runId: string): Promise<
  Array<{ seq: number; type: string; payload: unknown; at: Date }>
> {
  return await db
    .select({
      seq: lifeRunEvent.seq,
      type: lifeRunEvent.type,
      payload: lifeRunEvent.payload,
      at: lifeRunEvent.at,
    })
    .from(lifeRunEvent)
    .where(eq(lifeRunEvent.runId, runId))
    .orderBy(asc(lifeRunEvent.seq));
}

/**
 * Bump the project's denormalized stats after a run finishes. Uses jsonb
 * set-at-path + increment so no schema migration is needed to add new
 * stats keys — just write them from the app layer.
 */
export async function bumpProjectStats(
  projectId: string,
  costCents: number,
): Promise<void> {
  await db
    .update(lifeProject)
    .set({
      stats: sql`
        jsonb_set(
          jsonb_set(
            COALESCE(${lifeProject.stats}, '{}'::jsonb),
            '{totalRuns}',
            to_jsonb(
              (COALESCE((${lifeProject.stats} ->> 'totalRuns')::int, 0) + 1)
            )
          ),
          '{lastRunAt}',
          to_jsonb(NOW()::text)
        )
      `,
    })
    .where(eq(lifeProject.id, projectId));
}
