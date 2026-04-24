/**
 * GET /api/life/run/[project]/session/[sessionId]/state
 *
 * Rehydration endpoint — returns everything the UI needs to replay a
 * session on mount. See
 * `docs/superpowers/specs/2026-04-24-life-session-persistence.md`
 * for the full architecture (this is Layer 4 per that spec).
 *
 * Response shape:
 *   {
 *     session:  { id, projectSlug, createdAt, turnCount, totalCostCents },
 *     snapshot: { sceneJson, signalsJson, atEventSeq } | undefined,
 *     tail:     Envelope[]   // events after snapshot.atEventSeq
 *     cursor:   { nextAfter: number | null }
 *   }
 *
 * Auth: caller must match `session.consumerId` per `consumerKind`.
 * Anon sessions require matching anon-session cookie; user sessions
 * require a better-auth session whose user.id matches.
 *
 * Caching: `Cache-Control: private, no-store`. Session state is
 * mutable and per-user; do not cache at the edge.
 *
 * Pagination: events beyond the initial window can be fetched via the
 * companion `/events?after=<globalSeq>` endpoint (lands with the
 * scrollback PR — not part of this first slice).
 */

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";

import { getSafeSession } from "@/lib/auth";
import { getAnonymousSession } from "@/lib/anonymous-session-server";
import {
  getProjectBySlug,
  getSessionEnvelopes,
  getSessionSummary,
} from "@/lib/life-runtime/queries";

const ParamsSchema = z.object({
  project: z.string().min(1).max(128),
  sessionId: z.string().uuid(),
});

/**
 * Initial events-window cap. Chosen so a ~10-turn session delivers in
 * one round trip (typical envelope density is ~15-25 events/turn). Long
 * sessions get a `cursor.nextAfter` and load older history on scroll.
 */
const INITIAL_WINDOW = 200;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ project: string; sessionId: string }> },
) {
  try {
    const raw = await params;
    const parsed = ParamsSchema.safeParse(raw);
    if (!parsed.success) {
      return notFound();
    }
    const { project: slug, sessionId } = parsed.data;

    // Verify project exists + session belongs to it before checking auth,
    // because we return a uniform 404 whether the session is missing OR
    // the caller isn't authorized. Existence + authorization failures
    // are indistinguishable to the outside world by design.
    const project = await getProjectBySlug(slug);
    if (!project) return notFound();

    const summary = await getSessionSummary(sessionId);
    if (!summary || summary.session.projectId !== project.id) {
      return notFound();
    }

    // Auth gate. Consumer-kind-aware ownership check.
    if (!(await callerOwnsSession(summary.session))) {
      return notFound();
    }

    const { events, hasMore } = await getSessionEnvelopes({
      sessionId,
      after: 0,
      limit: INITIAL_WINDOW,
    });

    const lastSeq = events.at(-1)?.globalSeq ?? 0;

    return NextResponse.json(
      {
        session: {
          id: summary.session.id,
          projectSlug: summary.projectSlug,
          createdAt: summary.session.createdAt.toISOString(),
          turnCount: summary.turnCount,
          totalCostCents: summary.totalCostCents,
          lastActivityAt: summary.lastActivityAt?.toISOString() ?? null,
        },
        // Snapshot path lands in Phase 4 (snapshot-cadence PR). Today
        // the tail IS the full history — fine for current session
        // lengths. UI replays from makeInitialScene onwards.
        snapshot: null,
        tail: events.map((e) => e.envelope),
        cursor: {
          nextAfter: hasMore ? lastSeq : null,
        },
      },
      {
        headers: {
          "Cache-Control": "private, no-store",
        },
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[life/session/state] uncaught:", err);
    return NextResponse.json(
      {
        error: "internal",
        // Include a truncated message so production debugging doesn't
        // require function log access. Safe: no secrets, no PII — just
        // Drizzle/Postgres error strings and stack tips. If this ever
        // needs to leak less, wrap in a dev-env check.
        detail: message.slice(0, 240),
      },
      { status: 500 },
    );
  }
}

/**
 * 404 — never leak "session exists but you can't see it" vs "session
 * doesn't exist." Uniform response either way.
 */
function notFound(): NextResponse {
  return NextResponse.json({ error: "not_found" }, { status: 404 });
}

/**
 * Auth predicate: does the current caller own this session? Mirrors
 * the consumer-resolution logic in the Prosopon run endpoint so behavior
 * is consistent. Returns false on any ambiguity — callers treat false
 * the same as "session doesn't exist."
 */
async function callerOwnsSession(
  session: { consumerKind: "user" | "anon"; consumerId: string },
): Promise<boolean> {
  const hdrs = await headers();

  if (session.consumerKind === "user") {
    const authed = await getSafeSession({ fetchOptions: { headers: hdrs } });
    return authed?.user?.id === session.consumerId;
  }

  // consumerKind === "anon" — match on anon cookie id.
  const anon = await getAnonymousSession();
  return anon?.id === session.consumerId;
}
