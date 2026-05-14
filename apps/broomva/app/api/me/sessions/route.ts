import "server-only";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getSafeSession } from "@/lib/auth";
import { listSessions } from "@/lib/workspace/session-registry";

/**
 * GET /api/me/sessions
 *
 * Returns the logged-in user's session id list (most-recent first),
 * sourced from the in-memory registry. v1.1 (Plan E) replaces the
 * registry with lifegw's Identity.ListSessions RPC backed by Lago
 * persistence; the wire shape stays the same.
 *
 * Returns 401 when no session.
 */
export async function GET(): Promise<NextResponse> {
  const h = await headers();
  const { data: session } = await getSafeSession({
    fetchOptions: { headers: h },
  });
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ sessions: listSessions(userId) });
}
