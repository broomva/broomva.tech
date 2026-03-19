/**
 * JWT signing for Lago auth — signs tokens with AUTH_SECRET so lagod
 * can validate them locally without a network round-trip.
 */

import { SignJWT } from "jose";

const JWT_EXPIRY = "7d";

/**
 * Sign a JWT for a user, compatible with lagod's lago-auth middleware.
 * Uses AUTH_SECRET as the shared HMAC key.
 */
export async function signLagoJWT(user: {
  id: string;
  email: string;
}): Promise<string> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET is required for Lago JWT signing");
  }

  const jwt = await new SignJWT({ sub: user.id, email: user.email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRY)
    .sign(new TextEncoder().encode(secret));

  return jwt;
}
