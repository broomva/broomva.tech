import { headers } from "next/headers";
import { getSafeSession } from "@/lib/auth";
import { verifyLifeJWT } from "@/lib/ai/vault/jwt";

interface ResolvedAuth {
  userId: string;
  email: string;
}

/**
 * Resolve the authenticated user from either:
 * 1. Bearer token (CLI/API — Life JWT signed with AUTH_SECRET)
 * 2. Session cookie (browser/web UI — Neon Auth)
 *
 * Returns null if unauthenticated.
 */
export async function resolveAuth(
  request: Request,
): Promise<ResolvedAuth | null> {
  // 1. Try Bearer token first (CLI/API usage)
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    if (token) {
      return resolveFromBearerToken(token);
    }
  }

  // 2. Fall back to session cookie (browser usage)
  const { data: sessionData } = await getSafeSession({
    fetchOptions: { headers: await headers() },
  });

  if (sessionData?.user?.id) {
    return {
      userId: sessionData.user.id,
      email: sessionData.user.email ?? "",
    };
  }

  return null;
}

/**
 * Verify a Life JWT Bearer token.
 * Returns the associated user if the token is valid and not expired.
 */
async function resolveFromBearerToken(
  token: string,
): Promise<ResolvedAuth | null> {
  const payload = await verifyLifeJWT(token);
  if (!payload) return null;
  return { userId: payload.sub, email: payload.email };
}
