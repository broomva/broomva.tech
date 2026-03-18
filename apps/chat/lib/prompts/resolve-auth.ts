import { headers } from "next/headers";
import { getSafeSession } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { session, user } from "@/lib/db/schema";
import { eq, and, gt } from "drizzle-orm";

interface ResolvedAuth {
  userId: string;
  email: string;
}

/**
 * Resolve the authenticated user from either:
 * 1. Session cookie (browser/web UI)
 * 2. Bearer token (CLI/API — uses session.token from DB)
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
 * Look up a bearer token in the session table.
 * Returns the associated user if the session is valid and not expired.
 */
async function resolveFromBearerToken(
  token: string,
): Promise<ResolvedAuth | null> {
  try {
    const [result] = await db
      .select({
        userId: session.userId,
        email: user.email,
        expiresAt: session.expiresAt,
      })
      .from(session)
      .innerJoin(user, eq(session.userId, user.id))
      .where(
        and(eq(session.token, token), gt(session.expiresAt, new Date())),
      )
      .limit(1);

    if (!result) return null;

    return {
      userId: result.userId,
      email: result.email,
    };
  } catch {
    return null;
  }
}
