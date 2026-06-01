/**
 * SpecDoc database queries — agent-authored HTML documents, owner-gated.
 *
 * Every read/delete is scoped to `ownerId` so ownership is enforced at the
 * query layer (defense in depth), independent of the route-level auth gate.
 */

import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { type SpecDoc, specDoc } from "@/lib/db/schema";

export interface CreateSpecDocParams {
  id: string;
  ownerId: string;
  title: string;
  html: string;
  sourceRepo?: string | null;
  sourcePath?: string | null;
  sourceCommit?: string | null;
}

/** Insert a new spec doc owned by `ownerId`. */
export async function createSpecDoc(
  params: CreateSpecDocParams,
): Promise<SpecDoc> {
  const [doc] = await db
    .insert(specDoc)
    .values({
      id: params.id,
      ownerId: params.ownerId,
      title: params.title,
      html: params.html,
      sourceRepo: params.sourceRepo ?? null,
      sourcePath: params.sourcePath ?? null,
      sourceCommit: params.sourceCommit ?? null,
    })
    .returning();
  if (!doc) {
    throw new Error("createSpecDoc: insert returned no row");
  }
  return doc;
}

/**
 * Fetch a spec doc by id, scoped to its owner.
 * Returns null when the doc does not exist OR belongs to a different owner —
 * callers cannot distinguish the two (no existence leak).
 */
export async function getSpecDocForOwner(
  id: string,
  ownerId: string,
): Promise<SpecDoc | null> {
  const [doc] = await db
    .select()
    .from(specDoc)
    .where(and(eq(specDoc.id, id), eq(specDoc.ownerId, ownerId)))
    .limit(1);
  return doc ?? null;
}

/** Metadata view of a spec doc — excludes the (potentially large) html body. */
export type SpecDocSummary = Omit<SpecDoc, "html">;

/** Max rows returned by {@link listSpecDocs} — bounds the response. */
const LIST_LIMIT = 200;

/** List an owner's spec docs, newest first (metadata only — no html body). */
export async function listSpecDocs(ownerId: string): Promise<SpecDocSummary[]> {
  return db
    .select({
      id: specDoc.id,
      ownerId: specDoc.ownerId,
      title: specDoc.title,
      sourceRepo: specDoc.sourceRepo,
      sourcePath: specDoc.sourcePath,
      sourceCommit: specDoc.sourceCommit,
      createdAt: specDoc.createdAt,
      updatedAt: specDoc.updatedAt,
    })
    .from(specDoc)
    .where(eq(specDoc.ownerId, ownerId))
    .orderBy(desc(specDoc.createdAt))
    .limit(LIST_LIMIT);
}

/** Delete a spec doc by id, scoped to owner. Returns true if a row was removed. */
export async function deleteSpecDoc(
  id: string,
  ownerId: string,
): Promise<boolean> {
  const deleted = await db
    .delete(specDoc)
    .where(and(eq(specDoc.id, id), eq(specDoc.ownerId, ownerId)))
    .returning({ id: specDoc.id });
  return deleted.length > 0;
}
