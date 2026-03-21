import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getSafeSession } from "@/lib/auth";
import { signLifeJWT } from "@/lib/ai/vault/jwt";

/**
 * GET /api/auth/api-token
 *
 * Signs a Life JWT for the current user, usable as a Bearer token in API calls.
 * Requires an active Neon Auth session (user must be logged in via browser).
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

  const token = await signLifeJWT({
    id: sessionData.user.id,
    email: sessionData.user.email ?? "",
  });

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  return NextResponse.json({
    token,
    expiresAt: expiresAt.toISOString(),
    usage: {
      header: `Authorization: Bearer ${token}`,
      env: `export BROOMVA_API_TOKEN="${token}"`,
      cli: `lago memory search "query" --token "${token}"`,
    },
  });
}
