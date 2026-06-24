import "server-only";

import { and, eq, gte, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { type SwapitFact, swapitFact } from "@/lib/db/schema";
import { computeFactId } from "@/lib/swapit/content-hash";

export { scanForbidden } from "@/lib/swapit/content-hash";

/**
 * swapit commons — server-side knowledge-fact store (the broomva.tech-backed commons).
 *
 * Mirrors the `swapit` skill's standalone FastAPI/SQLite reference server, but durable on
 * Postgres + Drizzle. Two invariants:
 *  - PRIVACY: a server-side backstop rejects any payload carrying an inventory-structural
 *    field, in lockstep with the client's `anonymize` gate (defense in depth).
 *  - INTEGRITY: the fact id is RECOMPUTED here from `(kind, payload)` with the exact same
 *    canonicalisation as the Python client, so a client cannot spoof an id, yet identical
 *    facts from different contributors still share an id and corroborate.
 */

// ── moderation + helpers ─────────────────────────────────────────────────────────
/** Approval is gated on DISTINCT contributors, not submission count and not the
 * caller-supplied `confidence`. A fact is served only once two *different* contributor
 * identities (server-derived: session user or client IP) have submitted it — so a single
 * source resubmitting the same fact can never self-approve it. */
function statusFor(distinctContributors: number): "approved" | "pending" {
  return distinctContributors >= 2 ? "approved" : "pending";
}

function clampUnit(x: unknown): number {
  const n = Number(x);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0.5;
}

export interface FactInput {
  kind: "product" | "item_class_hazard" | "alternative";
  payload: Record<string, unknown>;
}

function isUniqueViolation(err: unknown): boolean {
  return Boolean(err) && (err as { code?: string }).code === "23505";
}

async function upsertOnce(
  input: FactInput,
  contributorHash: string | null,
): Promise<SwapitFact> {
  const id = computeFactId(input.kind, input.payload);
  const incomingConf = clampUnit(input.payload.confidence);
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(swapitFact)
      .where(eq(swapitFact.id, id))
      .for("update")
      .limit(1);

    if (existing) {
      const contributors = new Set(existing.contributors);
      if (contributorHash) {
        contributors.add(contributorHash);
      }
      const corroboration = existing.corroborationCount + 1;
      const [row] = await tx
        .update(swapitFact)
        .set({
          // payload is NOT updated — corroboration means "I agree with THIS fact"
          confidence: String(
            Math.max(Number(existing.confidence), incomingConf),
          ),
          corroborationCount: corroboration,
          contributors: [...contributors].sort(),
          status: statusFor(contributors.size),
          lastSeen: new Date(),
        })
        .where(eq(swapitFact.id, id))
        .returning();
      return row;
    }

    const [row] = await tx
      .insert(swapitFact)
      .values({
        id,
        kind: input.kind,
        payload: input.payload,
        confidence: String(incomingConf),
        corroborationCount: 1,
        contributors: contributorHash ? [contributorHash] : [],
        status: statusFor(contributorHash ? 1 : 0),
      })
      .returning();
    return row;
  });
}

/** Content-address + corroborate a contributed fact. Concurrent first-inserts of the same
 * id collapse to a corroboration via a single retry. */
export async function upsertFact(
  input: FactInput,
  contributorHash: string | null,
): Promise<SwapitFact> {
  try {
    return await upsertOnce(input, contributorHash);
  } catch (err) {
    if (isUniqueViolation(err)) {
      return await upsertOnce(input, contributorHash); // row now exists → corroborate
    }
    throw err;
  }
}

export async function listApprovedSince(
  since: Date | null,
  minCorroboration = 1,
): Promise<SwapitFact[]> {
  const conditions = [
    eq(swapitFact.status, "approved"),
    gte(swapitFact.corroborationCount, minCorroboration),
  ];
  if (since && !Number.isNaN(since.getTime())) {
    conditions.push(gte(swapitFact.lastSeen, since));
  }
  return db
    .select()
    .from(swapitFact)
    .where(and(...conditions))
    .orderBy(swapitFact.lastSeen);
}

export async function commonsStats(): Promise<{
  factsTotal: number;
  factsApproved: number;
}> {
  const [row] = await db
    .select({
      total: sql<number>`count(*)::int`,
      approved: sql<number>`count(*) filter (where ${swapitFact.status} = 'approved')::int`,
    })
    .from(swapitFact);
  return {
    factsTotal: Number(row?.total ?? 0),
    factsApproved: Number(row?.approved ?? 0),
  };
}

/** Shape a row for the wire (snake_case, matching the skill's sync client). */
export function serializeFact(f: SwapitFact) {
  return {
    id: f.id,
    kind: f.kind,
    payload: f.payload,
    confidence: Number(f.confidence),
    corroboration_count: f.corroborationCount,
    contributor_count: f.contributors.length,
    status: f.status,
    first_seen: f.firstSeen,
    last_seen: f.lastSeen,
  };
}
