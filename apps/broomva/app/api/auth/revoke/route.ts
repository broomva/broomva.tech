import { NextResponse } from "next/server";
import { eq, and, isNull } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "@/lib/db/client";
import { refreshToken as refreshTokenTable } from "@/lib/db/schema";
import {
  verifyLifeJWT,
  verifyLifeJWTAllowExpired,
  hashRefreshToken,
} from "@/lib/ai/vault/jwt";
import { getSafeSession } from "@/lib/auth";
import {
  checkRefreshRateLimit,
  getClientIP,
} from "@/lib/utils/rate-limit";

/**
 * POST /api/auth/revoke
 *
 * Revokes refresh tokens. Two modes:
 *
 *   1. Revoke a specific token:
 *      Body: { "refreshToken": "<raw-token>" }
 *
 *   2. Revoke ALL tokens for the authenticated user:
 *      Body: { "all": true }
 *      Requires a valid access JWT in Authorization header or active browser session.
 *
 * Returns: { revoked: number } — count of tokens revoked.
 */
export async function POST(request: Request) {
  try {
    // Rate limit (shared with refresh — same bucket)
    const clientIP = getClientIP(request);
    const rateLimitResult = await checkRefreshRateLimit(clientIP);

    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: "rate_limit_exceeded", error_description: rateLimitResult.error },
        { status: 429, headers: rateLimitResult.headers || {} },
      );
    }

    const body = await request.json().catch(() => null);

    if (!body) {
      return NextResponse.json(
        { error: "invalid_request", error_description: "Request body required" },
        { status: 400 },
      );
    }

    // ── Mode 1: Revoke a specific refresh token ─────────────────────
    if (body.refreshToken && typeof body.refreshToken === "string") {
      const tokenHash = hashRefreshToken(body.refreshToken);

      const revokedRows = await db
        .update(refreshTokenTable)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(refreshTokenTable.tokenHash, tokenHash),
            isNull(refreshTokenTable.revokedAt),
          ),
        )
        .returning({ id: refreshTokenTable.id });

      return NextResponse.json({ revoked: revokedRows.length });
    }

    // ── Mode 2: Revoke all tokens for the user ──────────────────────
    if (body.all === true) {
      const userId = await resolveUserId(request);

      if (!userId) {
        return NextResponse.json(
          { error: "unauthorized", error_description: "Authentication required to revoke all tokens" },
          { status: 401 },
        );
      }

      const revokedRows = await db
        .update(refreshTokenTable)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(refreshTokenTable.userId, userId),
            isNull(refreshTokenTable.revokedAt),
          ),
        )
        .returning({ id: refreshTokenTable.id });

      return NextResponse.json({ revoked: revokedRows.length });
    }

    return NextResponse.json(
      { error: "invalid_request", error_description: "Provide refreshToken or { all: true }" },
      { status: 400 },
    );
  } catch (error) {
    console.error("Revoke request failed:", error);
    return NextResponse.json(
      {
        error: "server_error",
        error_description:
          process.env.NODE_ENV === "production"
            ? "Internal server error"
            : String(error),
      },
      { status: 500 },
    );
  }
}

/**
 * Resolve user identity from Bearer token or browser session.
 */
async function resolveUserId(request: Request): Promise<string | null> {
  // Try Bearer token (allow expired access tokens for revocation)
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    // Try valid token first, then expired
    const payload =
      (await verifyLifeJWT(token)) ??
      (await verifyLifeJWTAllowExpired(token));
    if (payload) return payload.sub;
  }

  // Try browser session
  const { data: sessionData } = await getSafeSession({
    fetchOptions: { headers: await headers() },
  });

  return sessionData?.user?.id ?? null;
}
