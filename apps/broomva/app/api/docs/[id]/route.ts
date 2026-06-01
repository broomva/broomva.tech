import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { deleteSpecDoc, getSpecDocForOwner } from "@/lib/db/spec-doc-queries";
import { resolveAuth } from "@/lib/prompts/resolve-auth";

/**
 * /api/docs/[id] — fetch metadata for / delete a single owned doc.
 * Both are owner-scoped: a doc owned by a different user (or missing) returns
 * 404, so callers cannot probe for existence.
 */

/** GET /api/docs/[id] — metadata for one owned doc (excludes html body). */
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

/** DELETE /api/docs/[id] — delete one owned doc. */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await resolveAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const ok = await deleteSpecDoc(id, auth.userId);
  if (!ok) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
