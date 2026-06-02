import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { resolveSpecDocForViewer } from "@/lib/db/spec-doc-queries";
import { resolveAuth } from "@/lib/prompts/resolve-auth";

/**
 * GET /api/docs/[id]/content — returns the full HTML body of an owned doc.
 *
 * The sibling `GET /api/docs/[id]` deliberately strips `html` to metadata-only;
 * this endpoint returns it. `[id]` is treated as a REF (a stable handle →
 * latest active version, or a legacy/standalone id); `?version=<n>` pins a
 * specific version. Owner-scoped via resolveAuth + resolveSpecDocForViewer
 * (404 when not the owner's or missing — no existence leak).
 *
 * This is the cross-session "continue" keystone (BRO-1335): a continuing agent,
 * a fresh chat, or a service fetches the EXACT operating spec body by ref +
 * Bearer — including, recursively, /d/maestro itself.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await resolveAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const versionParam = new URL(request.url).searchParams.get("version");
  let version: number | undefined;
  if (versionParam != null) {
    version = Number.parseInt(versionParam, 10);
    if (!Number.isInteger(version) || version < 1) {
      return NextResponse.json({ error: "Invalid version" }, { status: 400 });
    }
  }

  const doc = await resolveSpecDocForViewer(id, auth.userId, version);
  if (!doc) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: doc.id,
    handle: doc.handle,
    version: doc.version,
    state: doc.state,
    title: doc.title,
    html: doc.html,
  });
}
