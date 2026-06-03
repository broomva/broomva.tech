/**
 * SpecDoc database queries — agent-authored HTML documents, owner-gated, with
 * a stable-handle + version lifecycle (BRO-1300).
 *
 * Identity model: a doc has a stable `handle`; each publish appends a `version`
 * and supersedes the prior active version. `/d/<handle>` serves the latest
 * non-expired version; `/d/<handle>/v<n>` pins one. Legacy/standalone docs use
 * `handle = id`, so a bare id keeps resolving.
 *
 * Every read/mutation is scoped to `ownerId` — ownership is enforced at the
 * query layer (defense in depth), independent of the route-level auth gate.
 */

import { and, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { type SpecDoc, type SpecDocState, specDoc } from "@/lib/db/schema";

/** Active states shown in the default list and superseded on re-publish. */
const ACTIVE_STATES: SpecDocState[] = ["published", "draft"];

/**
 * States shown on the Maestro board: active (published/draft) plus archived
 * (manageable — restore/delete). Superseded + expired are version history
 * (reachable via /d/<handle>/v/<n>), and deleted rows are gone — none belong
 * on the board.
 */
const BOARD_STATES: SpecDocState[] = ["published", "draft", "archived"];

/** Max rows returned by list endpoints — bounds the response. */
const LIST_LIMIT = 200;

/** Normalize a string into a URL-safe handle (≤64 chars). */
export function slugifyHandle(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

/**
 * Resolve the handle for a publish:
 *   explicit `handle` → slug of it
 *   else `sourcePath` → slug of its basename (stable across iterations)
 *   else the new row's `id` (standalone — behaves like the pre-lifecycle model)
 */
export function deriveHandle(params: {
  handle?: string | null;
  sourcePath?: string | null;
  id: string;
}): string {
  if (params.handle) {
    const s = slugifyHandle(params.handle);
    if (s) return s;
  }
  if (params.sourcePath) {
    const base = params.sourcePath.split("/").pop() ?? "";
    const s = slugifyHandle(base.replace(/\.[a-z0-9]+$/i, ""));
    if (s) return s;
  }
  return params.id;
}

export interface PublishSpecDocParams {
  id: string;
  ownerId: string;
  title: string;
  html: string;
  handle?: string | null;
  draft?: boolean;
  sourceRepo?: string | null;
  sourcePath?: string | null;
  sourceCommit?: string | null;
  ticketId?: string | null;
  prNumber?: number | null;
  sessionId?: string | null;
}

/**
 * Publish a new version under a handle. The prior active version(s) of that
 * handle become `superseded`; the new row is `draft` or `published`. Atomic.
 */
export async function publishSpecDoc(
  params: PublishSpecDocParams,
): Promise<SpecDoc> {
  const handle = deriveHandle(params);
  return db.transaction(async (tx) => {
    // Serialize concurrent publishes to the same (owner, handle): the
    // read-max-then-insert below would otherwise race two callers into the
    // same version and a duplicate-key error. The advisory lock auto-releases
    // at transaction end.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`${params.ownerId}/${handle}`}, 0))`,
    );
    const [agg] = await tx
      .select({ maxV: sql<number>`coalesce(max(${specDoc.version}), 0)` })
      .from(specDoc)
      .where(
        and(eq(specDoc.ownerId, params.ownerId), eq(specDoc.handle, handle)),
      );
    const version = (agg?.maxV ?? 0) + 1;

    if (version > 1) {
      await tx
        .update(specDoc)
        .set({ state: "superseded" })
        .where(
          and(
            eq(specDoc.ownerId, params.ownerId),
            eq(specDoc.handle, handle),
            inArray(specDoc.state, ACTIVE_STATES),
            isNull(specDoc.deletedAt),
          ),
        );
    }

    const [doc] = await tx
      .insert(specDoc)
      .values({
        id: params.id,
        ownerId: params.ownerId,
        handle,
        version,
        state: params.draft ? "draft" : "published",
        title: params.title,
        html: params.html,
        sourceRepo: params.sourceRepo ?? null,
        sourcePath: params.sourcePath ?? null,
        sourceCommit: params.sourceCommit ?? null,
        ticketId: params.ticketId ?? null,
        prNumber: params.prNumber ?? null,
        sessionId: params.sessionId ?? null,
      })
      .returning();
    if (!doc) {
      throw new Error("publishSpecDoc: insert returned no row");
    }
    return doc;
  });
}

/**
 * Fetch a doc by exact id, owner-scoped. Null when missing or not the owner's
 * (no existence leak). Excludes soft-deleted rows.
 */
export async function getSpecDocForOwner(
  id: string,
  ownerId: string,
): Promise<SpecDoc | null> {
  const [doc] = await db
    .select()
    .from(specDoc)
    .where(
      and(
        eq(specDoc.id, id),
        eq(specDoc.ownerId, ownerId),
        isNull(specDoc.deletedAt),
      ),
    )
    .limit(1);
  return doc ?? null;
}

/**
 * Resolve a doc for the viewer from a `<ref>` that is either a handle or a
 * legacy/standalone id, optionally pinned to a `version`.
 *   - version given → that exact (handle, version)
 *   - else → latest ACTIVE (published/draft) version of the handle
 *   - else → exact id, active-state (legacy/standalone fallback)
 * Soft-deleted, archived, expired, and superseded rows are never served here;
 * archived/expired/superseded remain reachable only by explicit version pin.
 */
export async function resolveSpecDocForViewer(
  ref: string,
  ownerId: string,
  version?: number,
): Promise<SpecDoc | null> {
  if (version != null) {
    const [pinned] = await db
      .select()
      .from(specDoc)
      .where(
        and(
          eq(specDoc.ownerId, ownerId),
          eq(specDoc.handle, ref),
          eq(specDoc.version, version),
          isNull(specDoc.deletedAt),
        ),
      )
      .limit(1);
    return pinned ?? null;
  }

  const [latest] = await db
    .select()
    .from(specDoc)
    .where(
      and(
        eq(specDoc.ownerId, ownerId),
        eq(specDoc.handle, ref),
        inArray(specDoc.state, ACTIVE_STATES),
        isNull(specDoc.deletedAt),
      ),
    )
    .orderBy(desc(specDoc.version))
    .limit(1);
  if (latest) return latest;

  // Legacy/standalone fallback: a bare id, also restricted to active state so
  // archived/expired/superseded rows are never served at /d/<ref> (they remain
  // reachable only by an explicit version pin).
  const [byId] = await db
    .select()
    .from(specDoc)
    .where(
      and(
        eq(specDoc.id, ref),
        eq(specDoc.ownerId, ownerId),
        inArray(specDoc.state, ACTIVE_STATES),
        isNull(specDoc.deletedAt),
      ),
    )
    .limit(1);
  return byId ?? null;
}

/** Metadata view — excludes the (potentially large) html body. */
export type SpecDocSummary = Omit<SpecDoc, "html">;

const SUMMARY_COLUMNS = {
  id: specDoc.id,
  ownerId: specDoc.ownerId,
  handle: specDoc.handle,
  version: specDoc.version,
  state: specDoc.state,
  orchState: specDoc.orchState,
  altitude: specDoc.altitude,
  dispatchCount: specDoc.dispatchCount,
  title: specDoc.title,
  sourceRepo: specDoc.sourceRepo,
  sourcePath: specDoc.sourcePath,
  sourceCommit: specDoc.sourceCommit,
  ticketId: specDoc.ticketId,
  prNumber: specDoc.prNumber,
  sessionId: specDoc.sessionId,
  expiresAt: specDoc.expiresAt,
  deletedAt: specDoc.deletedAt,
  createdAt: specDoc.createdAt,
  updatedAt: specDoc.updatedAt,
} as const;

/** The owner's active docs — latest version per handle (no superseded/archived/expired/deleted). */
export async function listSpecDocs(ownerId: string): Promise<SpecDocSummary[]> {
  return db
    .select(SUMMARY_COLUMNS)
    .from(specDoc)
    .where(
      and(
        eq(specDoc.ownerId, ownerId),
        inArray(specDoc.state, ACTIVE_STATES),
        isNull(specDoc.deletedAt),
      ),
    )
    .orderBy(desc(specDoc.createdAt))
    .limit(LIST_LIMIT);
}

/**
 * The Maestro board view — the owner's published, draft, and archived docs
 * (BRO-1349), newest first. Superseded/expired/deleted are excluded (they are
 * version history or gone). Like {@link listSpecDocs} this is owner-scoped and
 * excludes the html body.
 */
export async function listBoardSpecDocs(
  ownerId: string,
): Promise<SpecDocSummary[]> {
  return db
    .select(SUMMARY_COLUMNS)
    .from(specDoc)
    .where(
      and(
        eq(specDoc.ownerId, ownerId),
        inArray(specDoc.state, BOARD_STATES),
        isNull(specDoc.deletedAt),
      ),
    )
    .orderBy(desc(specDoc.createdAt))
    .limit(LIST_LIMIT);
}

/** All (non-deleted) versions of a handle, newest first. */
export async function listSpecDocVersions(
  handle: string,
  ownerId: string,
): Promise<SpecDocSummary[]> {
  return db
    .select(SUMMARY_COLUMNS)
    .from(specDoc)
    .where(
      and(
        eq(specDoc.ownerId, ownerId),
        eq(specDoc.handle, handle),
        isNull(specDoc.deletedAt),
      ),
    )
    .orderBy(desc(specDoc.version))
    .limit(LIST_LIMIT);
}

/** Promote the latest draft of a handle to published. Returns false if none. */
export async function promoteLatestDraft(
  handle: string,
  ownerId: string,
): Promise<boolean> {
  const [draft] = await db
    .select({ id: specDoc.id })
    .from(specDoc)
    .where(
      and(
        eq(specDoc.ownerId, ownerId),
        eq(specDoc.handle, handle),
        eq(specDoc.state, "draft"),
        isNull(specDoc.deletedAt),
      ),
    )
    .orderBy(desc(specDoc.version))
    .limit(1);
  if (!draft) return false;
  await db
    .update(specDoc)
    .set({ state: "published" })
    .where(and(eq(specDoc.id, draft.id), eq(specDoc.ownerId, ownerId)));
  return true;
}

/**
 * Set a doc's state by exact id (e.g. archive). Owner-scoped, non-deleted only —
 * `deletedAt` is left untouched, so this never undeletes a soft-deleted doc
 * (un-delete is a Phase-2 concern). For restore use {@link restoreSpecDoc},
 * which also supersedes sibling active versions.
 */
export async function setSpecDocState(
  id: string,
  ownerId: string,
  state: SpecDocState,
): Promise<boolean> {
  const updated = await db
    .update(specDoc)
    .set({ state })
    .where(
      and(
        eq(specDoc.id, id),
        eq(specDoc.ownerId, ownerId),
        isNull(specDoc.deletedAt),
      ),
    )
    .returning({ id: specDoc.id });
  return updated.length > 0;
}

/**
 * Restore a doc (by id) to `published` as the SOLE active version of its handle:
 * in one transaction, supersede any other active version of the handle, then
 * publish the target. Prevents two active versions for one handle (the failure
 * a naive state-set would create). Owner-scoped, non-deleted only.
 */
export async function restoreSpecDoc(
  id: string,
  ownerId: string,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [target] = await tx
      .select({ handle: specDoc.handle })
      .from(specDoc)
      .where(
        and(
          eq(specDoc.id, id),
          eq(specDoc.ownerId, ownerId),
          isNull(specDoc.deletedAt),
        ),
      )
      .limit(1);
    if (!target) return false;

    // Supersede sibling active versions of the same handle (a null/standalone
    // handle has no siblings to collide with).
    if (target.handle) {
      await tx
        .update(specDoc)
        .set({ state: "superseded" })
        .where(
          and(
            eq(specDoc.ownerId, ownerId),
            eq(specDoc.handle, target.handle),
            inArray(specDoc.state, ACTIVE_STATES),
            isNull(specDoc.deletedAt),
            ne(specDoc.id, id),
          ),
        );
    }

    await tx
      .update(specDoc)
      .set({ state: "published" })
      .where(and(eq(specDoc.id, id), eq(specDoc.ownerId, ownerId)));
    return true;
  });
}

/** Soft-delete a doc by id (sets `deletedAt`); the Phase-2 reconciler GCs it. */
export async function softDeleteSpecDoc(
  id: string,
  ownerId: string,
): Promise<boolean> {
  const updated = await db
    .update(specDoc)
    .set({ deletedAt: sql`now()` })
    .where(
      and(
        eq(specDoc.id, id),
        eq(specDoc.ownerId, ownerId),
        isNull(specDoc.deletedAt),
      ),
    )
    .returning({ id: specDoc.id });
  return updated.length > 0;
}
