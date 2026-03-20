/**
 * JWT signing for Life Agent OS services — signs tokens with AUTH_SECRET
 * so Lago, Arcan, Autonomic, and Haima can validate them locally without
 * a network round-trip to broomva.tech.
 *
 * All Life services use the same HS256 shared secret (AUTH_SECRET).
 */

import { SignJWT } from "jose";

const JWT_EXPIRY = "7d";

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
    .setExpirationTime(JWT_EXPIRY)
    .sign(new TextEncoder().encode(secret));

  return jwt;
}

/** @deprecated Use signLifeJWT — kept for backward compatibility */
export const signLagoJWT = signLifeJWT;
