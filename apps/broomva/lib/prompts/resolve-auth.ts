import { headers } from "next/headers";
import { getSafeSession } from "@/lib/auth";
import { verifyLifeJWT } from "@/lib/ai/vault/jwt";
import { verifyAgentRequest } from "@/lib/agent-auth";

interface ResolvedAuth {
  userId: string;
  email: string;
  /** When present, the request was authenticated via Agent Auth Protocol */
  agentId?: string;
}

/**
 * Resolve the authenticated user from either:
 * 1. Agent Auth Protocol JWT (Ed25519 keypair — @better-auth/agent-auth)
 * 2. Bearer token (CLI/API — Life JWT signed with AUTH_SECRET)
 * 3. Session cookie (browser/web UI — Neon Auth)
 *
 * Returns null if unauthenticated.
 */
export async function resolveAuth(
  request: Request,
): Promise<ResolvedAuth | null> {
  const authHeader = request.headers.get("authorization");

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    if (token) {
      // 1. Try Agent Auth Protocol JWT first (Ed25519 signed)
      const agentSession = await resolveFromAgentJWT(request);
      if (agentSession) return agentSession;

      // 2. Try Life JWT (HS256 signed with AUTH_SECRET)
      const lifeAuth = await resolveFromBearerToken(token);
      if (lifeAuth) return lifeAuth;
    }
  }

  // 3. Fall back to session cookie (browser usage)
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
 * Verify an Agent Auth Protocol JWT (BRO-54).
 * Returns the associated user if the agent session is valid.
 */
async function resolveFromAgentJWT(
  request: Request,
): Promise<ResolvedAuth | null> {
  try {
    const session = await verifyAgentRequest(request);
    if (!session?.userId) return null;
    return {
      userId: session.userId,
      email: "", // Agent sessions don't carry email in the JWT
      agentId: session.agentId,
    };
  } catch {
    return null;
  }
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
