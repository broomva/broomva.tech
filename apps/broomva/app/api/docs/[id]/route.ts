import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  getSpecDocForOwner,
  setSpecDocState,
  softDeleteSpecDoc,
} from "@/lib/db/spec-doc-queries";
import { resolveAuth } from "@/lib/prompts/resolve-auth";

/**
 * /api/docs/[id] — metadata / archive·restore / soft-delete a single owned doc.
 * Owner-scoped: a doc owned by a different user (or missing) returns 404, so
 * callers cannot probe for existence.
 */

/** GET — metadata for one owned doc (excludes html body). */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await resolveAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const doc = await getSpecDocForOwner(id, auth.userId);
  if (!doc) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const { html: _html, ...meta } = doc;
  return NextResponse.json(meta);
}

/** PATCH — lifecycle transition by id: `{ action: "archive" | "restore" }`. */
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
  if (action !== "archive" && action !== "restore") {
    return NextResponse.json(
      { error: "action must be 'archive' or 'restore'" },
      { status: 400 },
    );
  }
  const { id } = await params;
  const nextState = action === "archive" ? "archived" : "published";
  const ok = await setSpecDocState(id, auth.userId, nextState);
  if (!ok) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, state: nextState });
}

/** DELETE — soft-delete one owned doc (sets deletedAt; Phase-2 reconciler GCs). */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await resolveAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const ok = await softDeleteSpecDoc(id, auth.userId);
  if (!ok) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
