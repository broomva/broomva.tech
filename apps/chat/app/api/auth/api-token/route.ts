import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getSafeSession } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { session } from "@/lib/db/schema";
import { eq, and, gt, desc } from "drizzle-orm";

/**
 * GET /api/auth/api-token
 *
 * Returns the current user's session token for use as a Bearer token in API calls.
 * Requires an active session (user must be logged in via browser).
 *
 * Usage:
 *   1. Log in at broomva.tech via OAuth
 *   2. GET /api/auth/api-token → { token: "..." }
 *   3. Use in CLI: BROOMVA_API_TOKEN=<token>
 *   4. API calls: Authorization: Bearer <token>
 */
export async function GET() {
  const { data: sessionData } = await getSafeSession({
    fetchOptions: { headers: await headers() },
  });

  if (!sessionData?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Get the most recent active session token for this user
  const [activeSession] = await db
    .select({ token: session.token, expiresAt: session.expiresAt })
    .from(session)
    .where(
      and(
        eq(session.userId, sessionData.user.id),
        gt(session.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(session.expiresAt))
    .limit(1);

  if (!activeSession) {
    return NextResponse.json(
      { error: "No active session found" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    token: activeSession.token,
    expiresAt: activeSession.expiresAt.toISOString(),
    usage: {
      header: `Authorization: Bearer ${activeSession.token}`,
      env: `export BROOMVA_API_TOKEN="${activeSession.token}"`,
      cli: `prompt-sync.py remote-push --token "${activeSession.token}" ...`,
    },
  });
}
