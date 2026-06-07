import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  getHandoffForOwner,
  isHandoffAction,
  setHandoffVisibility,
  softDeleteHandoff,
  transitionHandoff,
} from "@/lib/db/handoff-queries";
import { env } from "@/lib/env";
import { resolveAuth } from "@/lib/prompts/resolve-auth";

/**
 * /api/handoffs/[id] — metadata / queue transition / soft-delete a single owned
 * handoff. Owner-scoped: a handoff owned by a different user (or missing)
 * returns 404, so callers cannot probe for existence.
 */

function handoffUrl(request: NextRequest, ref: string): string {
  const base = (env.APP_URL || new URL(request.url).origin).replace(/\/+$/, "");
  return `${base}/h/${ref}`;
}

/** GET — full handoff (includes markdown body) for one owned row. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await resolveAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const row = await getHandoffForOwner(id, auth.userId);
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(row);
}

/**
 * PATCH — queue / sharing transition by id:
 * `{ action: "pick_up" | "complete" | "archive" | "requeue" | "share" | "unshare" }`.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await resolveAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const action = (body as { action?: unknown })?.action;
  const { id } = await params;
  if (action === "share" || action === "unshare") {
    const row = await setHandoffVisibility(
      id,
      auth.userId,
      action === "share" ? "public" : "private",
    );
    if (!row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({
      ok: true,
      visibility: row.visibility,
      publicUrl: action === "share" ? handoffUrl(request, row.id) : null,
    });
  }

  if (!isHandoffAction(action)) {
    return NextResponse.json(
      {
        error:
          "action must be 'pick_up', 'complete', 'archive', 'requeue', 'share', or 'unshare'",
      },
      { status: 400 },
    );
  }
  const nextStatus = await transitionHandoff(
    id,
    auth.userId,
    action,
    auth.agentId ? "agent" : "web",
  );
  if (!nextStatus) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, status: nextStatus });
}

/** DELETE — soft-delete one owned handoff (sets deletedAt). */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await resolveAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const ok = await softDeleteHandoff(id, auth.userId);
  if (!ok) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
