import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api/with-auth";
import { getRelaySessionById } from "@/lib/db/relay-queries";

/**
 * GET /api/relay/sessions/[id]
 *
 * Fetch a single relay session by ID. Only returns sessions owned by the
 * authenticated user.
 */
export const GET = withAuth(async (request, { userId }) => {
  const id = new URL(request.url).pathname.split("/").at(-1) ?? "";
  try {
    const session = await getRelaySessionById(id, userId);
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    return NextResponse.json({ session });
  } catch (err) {
    console.error("[relay/session] Error fetching session:", err);
    return NextResponse.json(
      { error: "Failed to fetch session" },
      { status: 500 },
    );
  }
});
