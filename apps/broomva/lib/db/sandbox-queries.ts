import "server-only";

import { and, desc, eq, gte, sql } from "drizzle-orm";

import { db } from "./client";
import { sandboxInstance, sandboxSnapshot } from "./schema";

// ── List ─────────────────────────────────────────────────────────────────────

/** All sandboxes belonging to an organization, newest first. */
export function getOrgSandboxes(organizationId: string) {
  return db
    .select()
    .from(sandboxInstance)
    .where(eq(sandboxInstance.organizationId, organizationId))
    .orderBy(desc(sandboxInstance.createdAt));
}

/** Single sandbox by its local UUID — org-scoped for authorization. */
export async function getSandboxById(
  id: string,
  organizationId: string,
) {
  const rows = await db
    .select()
    .from(sandboxInstance)
    .where(
      and(
        eq(sandboxInstance.id, id),
        eq(sandboxInstance.organizationId, organizationId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

/** Snapshots for a given sandbox instance, newest first, capped at 20. */
export function getSandboxSnapshots(sandboxInstanceId: string) {
  return db
    .select()
    .from(sandboxSnapshot)
    .where(eq(sandboxSnapshot.sandboxInstanceId, sandboxInstanceId))
    .orderBy(desc(sandboxSnapshot.createdAt))
    .limit(20);
}

// ── Metrics ──────────────────────────────────────────────────────────────────

/** Counts of active / snapshotted sandboxes + total execs in the last 24h. */
export async function getSandboxMetrics(organizationId: string) {
  const [metrics] = await db
    .select({
      active: sql<number>`count(*) filter (where ${sandboxInstance.status} = 'running')`,
      snapshotted: sql<number>`count(*) filter (where ${sandboxInstance.status} = 'snapshotted')`,
      execs24h: sql<number>`coalesce(sum(${sandboxInstance.execCount}) filter (where ${sandboxInstance.lastExecAt} >= now() - interval '24 hours'), 0)`,
    })
    .from(sandboxInstance)
    .where(eq(sandboxInstance.organizationId, organizationId));

  return {
    active: Number(metrics?.active ?? 0),
    snapshotted: Number(metrics?.snapshotted ?? 0),
    execs24h: Number(metrics?.execs24h ?? 0),
  };
}

// ── Mutations ────────────────────────────────────────────────────────────────

/** Update sandbox status. */
export function updateSandboxStatus(
  id: string,
  status: "starting" | "running" | "snapshotted" | "stopped" | "failed",
) {
  return db
    .update(sandboxInstance)
    .set({ status, updatedAt: new Date() })
    .where(eq(sandboxInstance.id, id));
}

/** Record a snapshot for a sandbox instance. */
export function recordSandboxSnapshot(
  sandboxInstanceId: string,
  snapshotId: string,
  trigger: "idle_reaper" | "manual" | "session_end" | "api",
  sizeBytes?: number,
) {
  return db.insert(sandboxSnapshot).values({
    sandboxInstanceId,
    snapshotId,
    trigger,
    sizeBytes: sizeBytes ?? null,
  });
}
