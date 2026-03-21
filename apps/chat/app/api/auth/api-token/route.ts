import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getSafeSession } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { refreshToken as refreshTokenTable } from "@/lib/db/schema";
import {
  signLifeJWT,
  generateRefreshToken,
  hashRefreshToken,
  JWT_ACCESS_EXPIRY_MS,
  JWT_REFRESH_EXPIRY_MS,
} from "@/lib/ai/vault/jwt";

/**
 * GET /api/auth/api-token
 *
 * Signs a Life JWT for the current user, usable as a Bearer token in API calls.
 * Requires an active Neon Auth session (user must be logged in via browser).
 *
 * Now also issues a refresh token (BRO-121) so clients can renew
 * the 24h access token without re-authenticating.
 *
 * Usage:
 *   1. Log in at broomva.tech via OAuth
 *   2. GET /api/auth/api-token → { token, refreshToken, ... }
 *   3. Use in CLI: BROOMVA_API_TOKEN=<token>
 *   4. API calls: Authorization: Bearer <token>
 *   5. When token expires, POST /api/auth/refresh with { refreshToken }
 */
export async function GET() {
  const { data: sessionData } = await getSafeSession({
    fetchOptions: { headers: await headers() },
  });

  if (!sessionData?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const userId = sessionData.user.id;
  const email = sessionData.user.email ?? "";

  // Issue access JWT (24h)
  const token = await signLifeJWT({ id: userId, email });
  const expiresAt = new Date(Date.now() + JWT_ACCESS_EXPIRY_MS);

  // Issue refresh token (7d) — stored as SHA-256 hash
  const rawRefreshToken = generateRefreshToken();
  const tokenHash = hashRefreshToken(rawRefreshToken);
  const refreshExpiresAt = new Date(Date.now() + JWT_REFRESH_EXPIRY_MS);

  await db.insert(refreshTokenTable).values({
    userId,
    tokenHash,
    expiresAt: refreshExpiresAt,
  });

  return NextResponse.json({
    token,
    refreshToken: rawRefreshToken,
    expiresAt: expiresAt.toISOString(),
    refreshExpiresAt: refreshExpiresAt.toISOString(),
    expiresIn: Math.floor(JWT_ACCESS_EXPIRY_MS / 1000),
    usage: {
      header: `Authorization: Bearer ${token}`,
      env: `export BROOMVA_API_TOKEN="${token}"`,
      cli: `lago memory search "query" --token "${token}"`,
      refresh: `curl -X POST /api/auth/refresh -d '{"refreshToken":"${rawRefreshToken}"}'`,
    },
  });
}
