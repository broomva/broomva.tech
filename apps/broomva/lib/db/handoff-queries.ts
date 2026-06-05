/**
 * Handoff queue queries (BRO-1415) — the narrative bridge that triggers the
 * next session. A handoff is pushed (`broomva handoff push`), queued, related
 * to specs, and run via Copy/Continue. Mirrors the SpecDoc lifecycle model:
 * stable `slug`, append a `version` per push, supersede the prior active one.
 *
 * Every read/mutation is scoped to `ownerId` — ownership is enforced at the
 * query layer (defense in depth), independent of the route-level auth gate.
 *
 * Each mutation emits a {@link handoffEvent} row in the SAME transaction, so
 * the realtime timeline on /maestro/queue is an exact, gap-free projection of
 * the queue's history.
 */

import { and, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db/client";
import { densifyDailyBuckets } from "@/lib/db/handoff-buckets";
import {
  type Handoff,
  type HandoffEventType,
  type HandoffStatus,
  handoff,
  handoffEvent,
} from "@/lib/db/schema";

export { densifyDailyBuckets } from "@/lib/db/handoff-buckets";

/** Statuses still "in the queue" (not superseded, not deleted). */
const ACTIVE_STATUSES: HandoffStatus[] = [
  "queued",
  "in_progress",
  "done",
  "archived",
];

/** Statuses superseded on re-push of the same slug. */
const SUPERSEDABLE_STATUSES: HandoffStatus[] = ["queued", "in_progress"];

/** Max rows returned by list endpoints — bounds the response. */
const LIST_LIMIT = 200;

/** Max events returned by the timeline endpoint per poll. */
const EVENT_LIMIT = 100;

/** Normalize a string into a URL-safe slug (≤64 chars). */
export function slugifyHandoff(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

/**
 * Resolve the slug for a push:
 *   explicit `slug` → slug of it
 *   else `sourcePath` basename (e.g. 2026-06-05-handoff-queue.md) → slug
 *   else the new row's `id` (standalone).
 */
export function deriveHandoffSlug(params: {
  slug?: string | null;
  sourcePath?: string | null;
  id: string;
}): string {
  if (params.slug) {
    const s = slugifyHandoff(params.slug);
    if (s) return s;
  }
  if (params.sourcePath) {
    const base = params.sourcePath.split("/").pop() ?? "";
    const s = slugifyHandoff(base.replace(/\.[a-z0-9]+$/i, ""));
    if (s) return s;
  }
  return params.id;
}

export interface PushHandoffParams {
  id: string;
  ownerId: string;
  title: string;
  body: string;
  slug?: string | null;
  tldr?: string | null;
  firstAction?: string | null;
  specRefs?: string[] | null;
  priority?: number | null;
  sourceRepo?: string | null;
  sourcePath?: string | null;
  sourceCommit?: string | null;
  branch?: string | null;
  ticketId?: string | null;
  prNumber?: number | null;
  sessionId?: string | null;
  /** Who pushed it — "cli" | "web" | "agent". Defaults to "cli". */
  actor?: string;
}

/**
 * Push a handoff onto the queue. The prior active version(s) of the same slug
 * become `superseded`; the new row is `queued`. Emits a `pushed` event (plus a
 * `superseded` event for any replaced version). Atomic + advisory-locked per
 * (owner, slug), exactly like {@link publishSpecDoc}.
 */
export async function pushHandoff(params: PushHandoffParams): Promise<Handoff> {
  const slug = deriveHandoffSlug(params);
  const actor = params.actor ?? "cli";
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`${params.ownerId}/handoff/${slug}`}, 0))`,
    );
    const [agg] = await tx
      .select({ maxV: sql<number>`coalesce(max(${handoff.version}), 0)` })
      .from(handoff)
      .where(and(eq(handoff.ownerId, params.ownerId), eq(handoff.slug, slug)));
    const version = (agg?.maxV ?? 0) + 1;

    if (version > 1) {
      const superseded = await tx
        .update(handoff)
        .set({ status: "superseded" })
        .where(
          and(
            eq(handoff.ownerId, params.ownerId),
            eq(handoff.slug, slug),
            inArray(handoff.status, SUPERSEDABLE_STATUSES),
            isNull(handoff.deletedAt),
          ),
        )
        .returning({ id: handoff.id });
      for (const row of superseded) {
        await tx.insert(handoffEvent).values({
          id: nanoid(16),
          handoffId: row.id,
          ownerId: params.ownerId,
          type: "superseded",
          actor,
          message: `Superseded by v${version}`,
        });
      }
    }

    const [row] = await tx
      .insert(handoff)
      .values({
        id: params.id,
        ownerId: params.ownerId,
        slug,
        version,
        status: "queued",
        priority: params.priority ?? 0,
        title: params.title,
        tldr: params.tldr ?? null,
        body: params.body,
        firstAction: params.firstAction ?? null,
        specRefs: params.specRefs ?? [],
        sourceRepo: params.sourceRepo ?? null,
        sourcePath: params.sourcePath ?? null,
        sourceCommit: params.sourceCommit ?? null,
        branch: params.branch ?? null,
        ticketId: params.ticketId ?? null,
        prNumber: params.prNumber ?? null,
        sessionId: params.sessionId ?? null,
      })
      .returning();
    if (!row) throw new Error("pushHandoff: insert returned no row");

    await tx.insert(handoffEvent).values({
      id: nanoid(16),
      handoffId: row.id,
      ownerId: params.ownerId,
      type: "pushed",
      actor,
      message:
        version > 1
          ? `Queued ${row.title} (v${version})`
          : `Queued ${row.title}`,
      metadata: {
        specRefs: params.specRefs ?? [],
        ticketId: params.ticketId ?? null,
      },
    });

    // A spec-link is a first-class timeline event so the "relate specs with
    // handoffs" linkage is visible on the stream.
    for (const ref of params.specRefs ?? []) {
      await tx.insert(handoffEvent).values({
        id: nanoid(16),
        handoffId: row.id,
        ownerId: params.ownerId,
        type: "linked",
        actor,
        message: `Linked spec /d/${ref}`,
        metadata: { specRef: ref },
      });
    }

    return row;
  });
}

/** Metadata view — excludes the (potentially large) markdown body. */
export type HandoffSummary = Omit<Handoff, "body">;

const SUMMARY_COLUMNS = {
  id: handoff.id,
  ownerId: handoff.ownerId,
  slug: handoff.slug,
  version: handoff.version,
  status: handoff.status,
  priority: handoff.priority,
  title: handoff.title,
  tldr: handoff.tldr,
  firstAction: handoff.firstAction,
  specRefs: handoff.specRefs,
  sourceRepo: handoff.sourceRepo,
  sourcePath: handoff.sourcePath,
  sourceCommit: handoff.sourceCommit,
  branch: handoff.branch,
  ticketId: handoff.ticketId,
  prNumber: handoff.prNumber,
  sessionId: handoff.sessionId,
  pickedUpAt: handoff.pickedUpAt,
  completedAt: handoff.completedAt,
  expiresAt: handoff.expiresAt,
  deletedAt: handoff.deletedAt,
  createdAt: handoff.createdAt,
  updatedAt: handoff.updatedAt,
} as const;

/**
 * The queue board view — the owner's active handoffs (queued/in_progress/done/
 * archived), highest priority then newest first. Superseded + deleted excluded.
 */
export async function listQueueHandoffs(
  ownerId: string,
): Promise<HandoffSummary[]> {
  return db
    .select(SUMMARY_COLUMNS)
    .from(handoff)
    .where(
      and(
        eq(handoff.ownerId, ownerId),
        inArray(handoff.status, ACTIVE_STATUSES),
        isNull(handoff.deletedAt),
      ),
    )
    .orderBy(desc(handoff.priority), desc(handoff.createdAt))
    .limit(LIST_LIMIT);
}

/** Fetch one handoff by id (full body), owner-scoped. Excludes soft-deleted. */
export async function getHandoffForOwner(
  id: string,
  ownerId: string,
): Promise<Handoff | null> {
  const [row] = await db
    .select()
    .from(handoff)
    .where(
      and(
        eq(handoff.id, id),
        eq(handoff.ownerId, ownerId),
        isNull(handoff.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** The status transition a PATCH requests → its target status + event type. */
const TRANSITIONS: Record<
  string,
  { status: HandoffStatus; event: HandoffEventType; verb: string }
> = {
  pick_up: { status: "in_progress", event: "picked_up", verb: "Picked up" },
  complete: { status: "done", event: "completed", verb: "Completed" },
  archive: { status: "archived", event: "archived", verb: "Archived" },
  requeue: { status: "queued", event: "restored", verb: "Re-queued" },
};

export type HandoffAction = keyof typeof TRANSITIONS;

export function isHandoffAction(value: unknown): value is HandoffAction {
  return typeof value === "string" && value in TRANSITIONS;
}

/**
 * Apply a queue transition to a handoff (owner-scoped, non-deleted), setting
 * the lifecycle timestamps and emitting the matching timeline event. Atomic.
 * Returns the new status, or null when the row is missing.
 */
export async function transitionHandoff(
  id: string,
  ownerId: string,
  action: HandoffAction,
  actor = "web",
): Promise<HandoffStatus | null> {
  const t = TRANSITIONS[action];
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ id: handoff.id, title: handoff.title })
      .from(handoff)
      .where(
        and(
          eq(handoff.id, id),
          eq(handoff.ownerId, ownerId),
          isNull(handoff.deletedAt),
        ),
      )
      .limit(1);
    if (!row) return null;

    const patch: Partial<typeof handoff.$inferInsert> = { status: t.status };
    if (action === "pick_up") patch.pickedUpAt = sql`now()` as never;
    if (action === "complete") patch.completedAt = sql`now()` as never;

    await tx
      .update(handoff)
      .set(patch)
      .where(and(eq(handoff.id, id), eq(handoff.ownerId, ownerId)));

    await tx.insert(handoffEvent).values({
      id: nanoid(16),
      handoffId: id,
      ownerId,
      type: t.event,
      actor,
      message: `${t.verb} ${row.title}`,
    });
    return t.status;
  });
}

/** Soft-delete a handoff by id (sets `deletedAt`). Owner-scoped. */
export async function softDeleteHandoff(
  id: string,
  ownerId: string,
): Promise<boolean> {
  const updated = await db
    .update(handoff)
    .set({ deletedAt: sql`now()` })
    .where(
      and(
        eq(handoff.id, id),
        eq(handoff.ownerId, ownerId),
        isNull(handoff.deletedAt),
      ),
    )
    .returning({ id: handoff.id });
  return updated.length > 0;
}

export type HandoffEventRow = {
  id: string;
  handoffId: string;
  type: HandoffEventType;
  actor: string;
  message: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
};

/**
 * The realtime timeline feed — the owner's recent events, newest first. When
 * `since` (an event id cursor's createdAt) is supplied, returns only events
 * strictly newer than it (the SSE tail). Owner-scoped.
 */
export async function listHandoffEvents(
  ownerId: string,
  opts: { since?: Date; limit?: number } = {},
): Promise<HandoffEventRow[]> {
  const limit = opts.limit ?? EVENT_LIMIT;
  const rows = await db
    .select({
      id: handoffEvent.id,
      handoffId: handoffEvent.handoffId,
      type: handoffEvent.type,
      actor: handoffEvent.actor,
      message: handoffEvent.message,
      metadata: handoffEvent.metadata,
      createdAt: handoffEvent.createdAt,
    })
    .from(handoffEvent)
    .where(
      opts.since
        ? and(
            eq(handoffEvent.ownerId, ownerId),
            gt(handoffEvent.createdAt, opts.since),
          )
        : eq(handoffEvent.ownerId, ownerId),
    )
    .orderBy(desc(handoffEvent.createdAt))
    .limit(limit);
  return rows as HandoffEventRow[];
}

export interface QueueAnalytics {
  /** Per-status counts of active (non-superseded/deleted) handoffs. */
  statusCounts: Record<HandoffStatus, number>;
  total: number;
  /** Handoffs completed in the last 7 days. */
  completed7d: number;
  /** Handoffs pushed in the last 7 days. */
  pushed7d: number;
  /** Median pickup latency (queued→in_progress), in minutes, last 30d. Null if none. */
  medianPickupMinutes: number | null;
  /** Average related specs per handoff. */
  avgSpecsPerHandoff: number;
  /** Daily push/complete buckets for the last 14 days (oldest→newest). */
  daily: Array<{ date: string; pushed: number; completed: number }>;
}

/**
 * Aggregate the queue for /maestro/analytics. One round-trip per metric; all
 * owner-scoped. Pickup latency uses `pickedUpAt - createdAt` over rows that
 * have been picked up. Daily buckets are computed in SQL (date_trunc) and
 * densified to a contiguous 14-day window in {@link densifyDailyBuckets}.
 */
export async function getQueueAnalytics(
  ownerId: string,
): Promise<QueueAnalytics> {
  const statusRows = await db
    .select({
      status: handoff.status,
      count: sql<number>`count(*)::int`,
      // `specRefs` is a `json` (not `jsonb`) column → json_array_length.
      specSum: sql<number>`coalesce(sum(coalesce(json_array_length(${handoff.specRefs}), 0)), 0)::int`,
    })
    .from(handoff)
    .where(and(eq(handoff.ownerId, ownerId), isNull(handoff.deletedAt)))
    .groupBy(handoff.status);

  const statusCounts: Record<HandoffStatus, number> = {
    queued: 0,
    in_progress: 0,
    done: 0,
    archived: 0,
    superseded: 0,
  };
  let total = 0;
  let specSum = 0;
  for (const r of statusRows) {
    if (r.status in statusCounts) statusCounts[r.status] = r.count;
    // "active" total excludes superseded (history), like the queue board.
    if (r.status !== "superseded") total += r.count;
    specSum += r.specSum;
  }
  const activeForSpecs =
    statusCounts.queued +
    statusCounts.in_progress +
    statusCounts.done +
    statusCounts.archived +
    statusCounts.superseded;

  const [windowed] = await db
    .select({
      pushed7d: sql<number>`count(*) filter (where ${handoff.createdAt} > now() - interval '7 days')::int`,
      completed7d: sql<number>`count(*) filter (where ${handoff.completedAt} > now() - interval '7 days')::int`,
      medianPickup: sql<number | null>`
        percentile_cont(0.5) within group (
          order by extract(epoch from (${handoff.pickedUpAt} - ${handoff.createdAt})) / 60.0
        ) filter (where ${handoff.pickedUpAt} is not null and ${handoff.createdAt} > now() - interval '30 days')
      `,
    })
    .from(handoff)
    .where(and(eq(handoff.ownerId, ownerId), isNull(handoff.deletedAt)));

  const dailyRows = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${handoff.createdAt}), 'YYYY-MM-DD')`,
      pushed: sql<number>`count(*)::int`,
    })
    .from(handoff)
    .where(
      and(
        eq(handoff.ownerId, ownerId),
        isNull(handoff.deletedAt),
        gt(handoff.createdAt, sql`now() - interval '14 days'`),
      ),
    )
    .groupBy(sql`date_trunc('day', ${handoff.createdAt})`);

  // Completions are keyed on `completedAt` (a handoff can complete on a
  // different day than it was pushed), so they get their own pass.
  const completedRows = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${handoff.completedAt}), 'YYYY-MM-DD')`,
      completed: sql<number>`count(*)::int`,
    })
    .from(handoff)
    .where(
      and(
        eq(handoff.ownerId, ownerId),
        isNull(handoff.deletedAt),
        sql`${handoff.completedAt} is not null`,
        gt(handoff.completedAt, sql`now() - interval '14 days'`),
      ),
    )
    .groupBy(sql`date_trunc('day', ${handoff.completedAt})`);

  const pushedByDay = new Map(dailyRows.map((r) => [r.day, r.pushed]));
  const completedByDay = new Map(
    completedRows.map((r) => [r.day, r.completed]),
  );

  return {
    statusCounts,
    total,
    completed7d: windowed?.completed7d ?? 0,
    pushed7d: windowed?.pushed7d ?? 0,
    medianPickupMinutes:
      windowed?.medianPickup != null ? Math.round(windowed.medianPickup) : null,
    avgSpecsPerHandoff:
      activeForSpecs > 0 ? Math.round((specSum / activeForSpecs) * 10) / 10 : 0,
    daily: densifyDailyBuckets(pushedByDay, completedByDay),
  };
}
