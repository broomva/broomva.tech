import { NextResponse } from "next/server";
import { eq, and, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { refreshToken as refreshTokenTable } from "@/lib/db/schema";
import {
  signLifeJWT,
  verifyLifeJWTAllowExpired,
  generateRefreshToken,
  hashRefreshToken,
  JWT_ACCESS_EXPIRY_MS,
  JWT_REFRESH_EXPIRY_MS,
} from "@/lib/ai/vault/jwt";
import {
  checkRefreshRateLimit,
  getClientIP,
} from "@/lib/utils/rate-limit";

/**
 * POST /api/auth/refresh
 *
 * Exchanges a valid refresh token for a new access JWT + rotated refresh token.
 *
 * Body: { "refreshToken": "..." }
 *
 * Optionally, an expired access JWT can be sent in the Authorization header
 * to provide user context (the refresh token alone is sufficient).
 *
 * Security:
 *   - Refresh token is looked up by SHA-256 hash (never stored raw)
 *   - Token rotation: old refresh token revoked, new one issued
 *   - Rate limited: 10 requests/minute per IP
 *   - Expired access tokens accepted (signature still validated)
 *
 * Returns: { accessToken, refreshToken, expiresIn }
 */
export async function POST(request: Request) {
  try {
    // Rate limit: 10 requests/minute per IP
    const clientIP = getClientIP(request);
    const rateLimitResult = await checkRefreshRateLimit(clientIP);

    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: "rate_limit_exceeded", error_description: rateLimitResult.error },
        { status: 429, headers: rateLimitResult.headers || {} },
      );
    }

    const body = await request.json().catch(() => null);
    const rawRefreshToken = body?.refreshToken;

    if (!rawRefreshToken || typeof rawRefreshToken !== "string") {
      return NextResponse.json(
        { error: "invalid_request", error_description: "Missing refreshToken in body" },
        { status: 400 },
      );
    }

    // Look up the refresh token by its hash
    const tokenHash = hashRefreshToken(rawRefreshToken);

    const [record] = await db
      .select()
      .from(refreshTokenTable)
      .where(
        and(
          eq(refreshTokenTable.tokenHash, tokenHash),
          isNull(refreshTokenTable.revokedAt),
        ),
      )
      .limit(1);

    if (!record) {
      return NextResponse.json(
        { error: "invalid_grant", error_description: "Refresh token not found or already revoked" },
        { status: 401 },
      );
    }

    // Check expiry
    if (new Date() > record.expiresAt) {
      // Revoke the expired token for hygiene
      await db
        .update(refreshTokenTable)
        .set({ revokedAt: new Date() })
        .where(eq(refreshTokenTable.id, record.id));

      return NextResponse.json(
        { error: "expired_token", error_description: "Refresh token has expired" },
        { status: 401 },
      );
    }

    // Determine user identity — prefer the refresh token's userId,
    // but cross-check with Bearer token if present
    const userId = record.userId;
    let email = "";

    const authHeader = request.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const accessToken = authHeader.slice(7);
      const payload = await verifyLifeJWTAllowExpired(accessToken);
      if (payload) {
        // Cross-check: refresh token must belong to the same user
        if (payload.sub !== record.userId) {
          return NextResponse.json(
            { error: "invalid_grant", error_description: "Token user mismatch" },
            { status: 401 },
          );
        }
        email = payload.email;
      }
    }

    // ── Token Rotation ──────────────────────────────────────────────
    // 1. Revoke the old refresh token
    await db
      .update(refreshTokenTable)
      .set({ revokedAt: new Date() })
      .where(eq(refreshTokenTable.id, record.id));

    // 2. Issue new access JWT
    const newAccessToken = await signLifeJWT({ id: userId, email });

    // 3. Issue new refresh token
    const newRawRefreshToken = generateRefreshToken();
    const newTokenHash = hashRefreshToken(newRawRefreshToken);
    const newExpiresAt = new Date(Date.now() + JWT_REFRESH_EXPIRY_MS);

    await db.insert(refreshTokenTable).values({
      userId,
      tokenHash: newTokenHash,
      expiresAt: newExpiresAt,
    });

    return NextResponse.json({
      accessToken: newAccessToken,
      refreshToken: newRawRefreshToken,
      expiresIn: Math.floor(JWT_ACCESS_EXPIRY_MS / 1000),
      refreshExpiresIn: Math.floor(JWT_REFRESH_EXPIRY_MS / 1000),
    });
  } catch (error) {
    console.error("Refresh token request failed:", error);
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
