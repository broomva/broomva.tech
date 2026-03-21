/**
 * JWT signing for Life Agent OS services — signs tokens with AUTH_SECRET
 * so Lago, Arcan, Autonomic, and Haima can validate them locally without
 * a network round-trip to broomva.tech.
 *
 * All Life services use the same HS256 shared secret (AUTH_SECRET).
 *
 * Security model (BRO-121):
 *   - Access tokens: 24h expiry (short-lived, used for API calls)
 *   - Refresh tokens: 7d expiry (hashed in DB, rotated on use)
 *   - Existing 7-day tokens continue to verify until natural expiry
 */

import { createHash, randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";

/** Access token lifetime — reduced from 7d to 24h (BRO-121) */
export const JWT_ACCESS_EXPIRY = "24h";
export const JWT_ACCESS_EXPIRY_MS = 24 * 60 * 60 * 1000;

/** Refresh token lifetime — 7 days */
export const JWT_REFRESH_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Sign a JWT for a user, compatible with lago-auth middleware used by
 * all Life Agent OS services (Lago, Arcan, Autonomic, Haima).
 * Uses AUTH_SECRET as the shared HMAC key.
 */
export async function signLifeJWT(user: {
  id: string;
  email: string;
}): Promise<string> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET is required for Life service JWT signing");
  }

  const jwt = await new SignJWT({ sub: user.id, email: user.email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(JWT_ACCESS_EXPIRY)
    .setIssuer("https://broomva.tech")
    .setAudience("broomva-life-services")
    .sign(new TextEncoder().encode(secret));

  return jwt;
}

/**
 * Verify a Life JWT and return the payload.
 * Returns null if the token is invalid or expired.
 *
 * Note: Tokens issued before BRO-121 with 7d expiry will continue to
 * verify successfully until they naturally expire — no hard cutover.
 */
export async function verifyLifeJWT(
  token: string,
): Promise<{ sub: string; email: string } | null> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return null;

  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(secret),
      { issuer: "https://broomva.tech", audience: "broomva-life-services" },
    );
    if (!payload.sub) return null;
    return { sub: payload.sub, email: (payload.email as string) ?? "" };
  } catch {
    return null;
  }
}

/**
 * Verify a Life JWT but allow expired tokens (for refresh flow).
 * Returns the payload even if `exp` has passed, but still validates
 * the signature, issuer, and audience.
 *
 * Returns null only if the token is structurally invalid or tampered with.
 */
export async function verifyLifeJWTAllowExpired(
  token: string,
): Promise<{ sub: string; email: string } | null> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return null;

  try {
    // First, try normal verification
    const result = await verifyLifeJWT(token);
    if (result) return result;

    // If that failed, try without clock tolerance — decode manually
    // jose doesn't have a built-in "ignore expiry" flag, so we decode
    // the payload after verifying the signature with a very large tolerance.
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(secret),
      {
        issuer: "https://broomva.tech",
        audience: "broomva-life-services",
        clockTolerance: "365d", // allow expired tokens up to 1 year
      },
    );
    if (!payload.sub) return null;
    return { sub: payload.sub, email: (payload.email as string) ?? "" };
  } catch {
    return null;
  }
}

// ─── Refresh Token Utilities ────────────────────────────────────────

/**
 * Generate a cryptographically random refresh token (64 hex chars).
 */
export function generateRefreshToken(): string {
  return randomBytes(32).toString("hex");
}

/**
 * SHA-256 hash a refresh token for safe storage.
 * We never store the raw token — only the hash.
 */
export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** @deprecated Use signLifeJWT — kept for backward compatibility */
export const signLagoJWT = signLifeJWT;
