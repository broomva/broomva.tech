/**
 * Life Runtime — database queries for projects, rules versions, runs, events.
 * Thin wrappers over Drizzle so the API route stays business-logic-focused.
 */

import "server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  lifeProject,
  lifeReservedSlug,
  lifeRulesVersion,
  lifeRun,
  lifeRunEvent,
  lifeSession,
  type LifeProject,
  type LifeRulesVersion,
  type LifeRun,
  type LifeSession,
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
  sessionId?: string;
  inputText?: string;
  consumerKind: ConsumerKind;
  consumerId: string;
  organizationId?: string;
  input: unknown;
  paymentMode: PaymentMode;
}

// ---------- sessions ----------

export interface GetOrCreateSessionParams {
  projectId: string;
  sessionId?: string; // if provided, must belong to (consumerKind, consumerId)
  consumerKind: "user" | "anon" | "agent";
  consumerId: string;
  organizationId?: string;
}

/**
 * Resolve a session — reuse `sessionId` if it belongs to the caller and
 * project; otherwise create a fresh one.
 */
export async function getOrCreateSession(
  p: GetOrCreateSessionParams,
): Promise<LifeSession> {
  if (p.sessionId) {
    const rows = await db
      .select()
      .from(lifeSession)
      .where(eq(lifeSession.id, p.sessionId))
      .limit(1);
    const row = rows[0];
    if (
      row &&
      row.projectId === p.projectId &&
      row.consumerKind === p.consumerKind &&
      row.consumerId === p.consumerId
    ) {
      return row;
    }
  }
  const [row] = await db
    .insert(lifeSession)
    .values({
      projectId: p.projectId,
      consumerKind: p.consumerKind,
      consumerId: p.consumerId,
      organizationId: p.organizationId ?? null,
    })
    .returning();
  if (!row) throw new Error("getOrCreateSession: insert returned no row");
  return row;
}

/**
 * Load recent turns of a session as a conversation history — { role, content }.
 * Skips turns whose input is non-text JSON (no inputText set).
 */
export async function getSessionHistory(
  sessionId: string,
  limit = 20,
): Promise<Array<{ role: "user" | "assistant"; content: string }>> {
  const rows = await db
    .select({
      id: lifeRun.id,
      inputText: lifeRun.inputText,
      output: lifeRun.output,
      status: lifeRun.status,
    })
    .from(lifeRun)
    .where(eq(lifeRun.sessionId, sessionId))
    .orderBy(desc(lifeRun.createdAt))
    .limit(limit);

  // Reverse to chronological order; emit user + assistant pairs.
  const history: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const row of rows.reverse()) {
    if (row.inputText) {
      history.push({ role: "user", content: row.inputText });
    }
    // Assistant output — use the text if stored as { text: string }, else skip.
    if (row.status === "succeeded" && row.output) {
      const output = row.output as { text?: string } | null;
      if (output?.text) history.push({ role: "assistant", content: output.text });
    }
  }
  return history;
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
      sessionId: params.sessionId ?? null,
      inputText: params.inputText ?? null,
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
 * Per-session envelope feed used by the replay endpoint + future
 * scrollback. Flattens across all runs belonging to a session and
 * exposes a single strictly-monotonic sequence (`globalSeq`).
 *
 * Why not just `lifeRunEvent.seq` directly? `seq` is per-run — each
 * run's envelopes start at 0. For a multi-turn session we need a
 * session-wide ordering so the client can paginate cursor-style
 * ("give me events after global_seq=N"). We synthesize that ordering
 * by sorting on `(run.createdAt, event.seq)` and re-numbering.
 *
 * The return shape carries both the synthetic `globalSeq` (for cursor)
 * and the raw envelope object (as stored in `payload.envelope` — the
 * Prosopon wire payload the emitter flushed).
 */
export async function getSessionEnvelopes(params: {
  sessionId: string;
  /** Cursor: return events with globalSeq > `after`. 0 = from start. */
  after?: number;
  /** Max rows to return. Defaults to 200, hard cap at 500. */
  limit?: number;
}): Promise<{
  events: Array<{
    globalSeq: number;
    runId: string;
    runSeq: number;
    type: string;
    envelope: Record<string, unknown>;
    at: Date;
  }>;
  hasMore: boolean;
}> {
  const after = params.after ?? 0;
  const limit = Math.min(params.limit ?? 200, 500);

  // Pull all runs for the session in creation order, then fan out
  // events. For the typical ~10 turns × ~20 envelopes = 200 rows case,
  // a single ordered join is cheap. If sessions grow very long the
  // caller should be hitting the scrollback path (which passes `after`),
  // so we over-read by 1 to compute hasMore cheaply.
  const runs = await db
    .select({ id: lifeRun.id, createdAt: lifeRun.createdAt })
    .from(lifeRun)
    .where(eq(lifeRun.sessionId, params.sessionId))
    .orderBy(asc(lifeRun.createdAt));

  if (runs.length === 0) {
    return { events: [], hasMore: false };
  }

  const runIds = runs.map((r) => r.id);
  const rawEvents = await db
    .select({
      runId: lifeRunEvent.runId,
      seq: lifeRunEvent.seq,
      type: lifeRunEvent.type,
      payload: lifeRunEvent.payload,
      at: lifeRunEvent.at,
    })
    .from(lifeRunEvent)
    .where(inArray(lifeRunEvent.runId, runIds))
    .orderBy(asc(lifeRunEvent.at), asc(lifeRunEvent.seq));

  // Assign globalSeq in the same order.
  let globalSeq = 0;
  const flattened = rawEvents.map((e) => {
    globalSeq += 1;
    const payload = e.payload as Record<string, unknown> | null;
    const envelope = (payload?.envelope as Record<string, unknown>) ??
      // Fallback: the emitter always wraps in `{ envelope: … }`, but for
      // safety in case old rows are bare, synthesize a minimal shape.
      ({
        version: 1,
        session_id: params.sessionId,
        seq: e.seq,
        ts: e.at.toISOString(),
        event: { type: e.type },
      } as Record<string, unknown>);
    return {
      globalSeq,
      runId: e.runId,
      runSeq: e.seq,
      type: e.type,
      envelope,
      at: e.at,
    };
  });

  // Apply cursor + limit post-flattening. Fine at current scale;
  // when we hit 10k-event sessions, push the cursor down into SQL.
  const windowed = flattened.filter((e) => e.globalSeq > after).slice(0, limit);
  const hasMore = flattened.filter((e) => e.globalSeq > after).length > limit;

  return { events: windowed, hasMore };
}

/**
 * Hydration summary for a session, used by the `/state` endpoint.
 * Returns session metadata + aggregate counters that would otherwise
 * require additional round trips from the client.
 */
export async function getSessionSummary(
  sessionId: string,
): Promise<{
  session: {
    id: string;
    projectId: string;
    /**
     * Widened from `lifeSession.consumerKind` ('user' | 'anon') to include
     * 'agent' because the broader session namespace (inherited from
     * LifeRun) does carry agent-origin sessions from x402 callers and
     * the no-auth fallback. Auth-matching callers need to see the
     * widest possible value.
     */
    consumerKind: "user" | "anon" | "agent";
    consumerId: string;
    organizationId: string | null;
    createdAt: Date;
    updatedAt: Date;
  };
  projectSlug: string;
  turnCount: number;
  totalCostCents: number;
  lastActivityAt: Date | null;
} | null> {
  const row = await db
    .select({
      id: lifeSession.id,
      projectId: lifeSession.projectId,
      consumerKind: lifeSession.consumerKind,
      consumerId: lifeSession.consumerId,
      organizationId: lifeSession.organizationId,
      createdAt: lifeSession.createdAt,
      updatedAt: lifeSession.updatedAt,
      projectSlug: lifeProject.slug,
    })
    .from(lifeSession)
    .innerJoin(lifeProject, eq(lifeSession.projectId, lifeProject.id))
    .where(eq(lifeSession.id, sessionId))
    .limit(1);

  if (row.length === 0) return null;
  const s = row[0]!;

  const runsAgg = await db
    .select({
      turnCount: sql<number>`COUNT(*)::int`,
      totalCostCents: sql<number>`COALESCE(SUM(${lifeRun.consumerPaidCents}), 0)::int`,
      // `LifeRun` has no `updatedAt`; use finishedAt when present, fall
      // back to startedAt / createdAt so an in-flight run still counts
      // as "recent activity."
      lastActivityAt: sql<Date | null>`MAX(COALESCE(${lifeRun.finishedAt}, ${lifeRun.startedAt}, ${lifeRun.createdAt}))`,
    })
    .from(lifeRun)
    .where(eq(lifeRun.sessionId, sessionId));

  const agg = runsAgg[0] ?? {
    turnCount: 0,
    totalCostCents: 0,
    lastActivityAt: null,
  };

  // Narrow to the widest possible consumerKind: LifeSession's column
  // is only ('user' | 'anon') today but the LifeRun side also uses
  // 'agent' for x402 + fallback anonymous callers, and older rows in
  // the wild can have that kind inherited. Cast defensively so callers
  // get the full shape.
  const consumerKind: "user" | "anon" | "agent" =
    s.consumerKind === "user"
      ? "user"
      : s.consumerKind === "anon"
        ? "anon"
        : "agent";

  return {
    session: {
      id: s.id,
      projectId: s.projectId,
      consumerKind,
      consumerId: s.consumerId,
      organizationId: s.organizationId,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    },
    projectSlug: s.projectSlug,
    turnCount: agg.turnCount,
    totalCostCents: agg.totalCostCents,
    lastActivityAt: agg.lastActivityAt,
  };
}

/**
 * Bump the project's denormalized stats after a run finishes.
 *
 * Read-modify-write in TS instead of an SQL jsonb_set expression — simpler,
 * one round trip, and avoids Drizzle/Postgres idiosyncrasies around column
 * references on the RHS of an UPDATE ... SET clause with jsonb functions.
 * Race condition on concurrent finishes is acceptable for a denormalized
 * counter (the authoritative run data lives in LifeRun).
 */
export async function bumpProjectStats(
  projectId: string,
  costCents: number,
): Promise<void> {
  const rows = await db
    .select({ stats: lifeProject.stats })
    .from(lifeProject)
    .where(eq(lifeProject.id, projectId))
    .limit(1);
  const current = (rows[0]?.stats as Record<string, unknown> | null) ?? {};
  const prevTotal =
    typeof current.totalRuns === "number" ? current.totalRuns : 0;
  const prevCostTotal =
    typeof current.totalCostCents === "number" ? current.totalCostCents : 0;
  const next = {
    ...current,
    totalRuns: prevTotal + 1,
    lastRunAt: new Date().toISOString(),
    totalCostCents: prevCostTotal + (costCents || 0),
  };
  await db
    .update(lifeProject)
    .set({ stats: next })
    .where(eq(lifeProject.id, projectId));
}
