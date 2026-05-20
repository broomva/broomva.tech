/**
 * Edge auth resolution for `/api/v1/messages` (and, in PR-2, the OpenAI
 * route).
 *
 * Decision D5 (locked in PR-1 of BRO-1208): exactly TWO accepted auth
 * sources, in priority order:
 *
 *   1. `Authorization: Bearer <jwt>` header — for CLI / SDK / BROOMVA_TOKEN
 *      callers. Verified via `verifyLifeJWT` (HS256, broomva.tech-issued
 *      access_token from `/api/auth/api-token` or `/api/auth/device/token`).
 *   2. Neon Auth session cookie — for browser callers from `broomva.tech`,
 *      `www.broomva.tech`, `broomva.github.io`, etc.
 *
 * Whichever path resolves the user, we then mint a FRESH ES256 lifegw
 * Tier-1 cap via `mintTier1ForConsumer` and forward THAT downstream. The
 * caller's HS256 token never leaves the edge — lifegw only ever sees the
 * ES256 cap signed with the key published at `/api/auth/jwks.json`.
 * This matches the spec's "mints a tier-1 JWT internally, and forwards"
 * and keeps the surface area for token-handling bugs minimal.
 *
 * Anonymous calls are explicitly NOT supported (spec line 115).
 *
 * Returns either an `EdgeAuthContext` ready for the route to use, OR a
 * `NextResponse` with the Anthropic-shape error envelope already set —
 * the route just `return`s it.
 */

import "server-only";
import { headers } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { verifyLifeJWT } from "@/lib/ai/vault/jwt";
import { getSafeSession } from "@/lib/auth";
import { mintTier1ForConsumer } from "@/lib/auth/lifegw-jwt";
import type { AnthropicErrorBody, EdgeAuthContext } from "./types";

/**
 * Default project slug attached to the Tier-1 mint when the caller
 * didn't explicitly scope to a project. `/api/v1/messages` is a global
 * edge endpoint, not project-scoped, so "default" is the right tag —
 * downstream consumers can re-scope on session creation.
 */
const DEFAULT_PROJECT_SLUG = "default";

function authError(message: string, status: number): NextResponse {
  const body: AnthropicErrorBody = {
    type: "error",
    error: {
      type: status === 401 ? "authentication_error" : "permission_error",
      message,
    },
  };
  return NextResponse.json(body, { status });
}

/**
 * Resolve a per-request auth context. Either returns a populated
 * `EdgeAuthContext` (the caller is authenticated and we have a fresh
 * lifegw Tier-1 cap ready to forward) OR a 401 `NextResponse` shaped
 * as an Anthropic error envelope.
 *
 * The function never throws on auth-related failures — it returns the
 * 401 response so the caller code path stays linear (`if (instanceof
 * NextResponse) return ctx;`).
 */
export async function resolveEdgeAuth(
  req: NextRequest,
): Promise<EdgeAuthContext | NextResponse> {
  // 1. Bearer header takes precedence over session cookie. CLI / SDK
  //    callers and browser callers that ALSO have a session cookie set
  //    (e.g. someone debugging from the broomva.tech tab) should use
  //    the bearer they explicitly attached — that's the lower-friction
  //    auth path and the one their API client expects.
  const bearer = extractBearer(req);
  if (bearer) {
    const claims = await verifyLifeJWT(bearer);
    if (!claims) {
      return authError(
        "Invalid or expired bearer token (HS256 verify against AUTH_SECRET failed)",
        401,
      );
    }
    return mintAndReturn(claims.sub, "header");
  }

  // 2. Fall back to Neon Auth session cookie (browser flow). We read
  //    headers explicitly because Next 15's `getSafeSession` wants the
  //    fetchOptions threaded through; on the edge route the
  //    `headers()` helper returns the inbound request headers.
  const { data: session } = await getSafeSession({
    fetchOptions: { headers: await headers() },
  });
  if (session?.user?.id) {
    return mintAndReturn(session.user.id, "session");
  }

  return authError(
    "Authentication required: provide an Authorization: Bearer header or sign in at broomva.tech.",
    401,
  );
}

/**
 * Mint a fresh ES256 lifegw Tier-1 cap for the resolved user and pack
 * it into an `EdgeAuthContext`. Mint failures are surfaced as 500s —
 * the most likely cause is the operator forgetting to set
 * `LIFEGW_TIER1_SIGNING_JWK` in production (see `lifegw-jwt.ts` for
 * the explicit error message).
 */
async function mintAndReturn(
  userId: string,
  source: EdgeAuthContext["source"],
): Promise<EdgeAuthContext | NextResponse> {
  try {
    const cap = await mintTier1ForConsumer({
      consumer: { kind: "user", id: userId },
      projectSlug: DEFAULT_PROJECT_SLUG,
    });
    return {
      tier1Token: cap.token,
      userId,
      projectId: DEFAULT_PROJECT_SLUG,
      source,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const body: AnthropicErrorBody = {
      type: "error",
      error: {
        type: "api_error",
        message: `Failed to mint internal lifegw cap: ${message}`,
      },
    };
    return NextResponse.json(body, { status: 500 });
  }
}

/**
 * Parse a `Bearer <token>` header. Returns `null` for any malformed or
 * missing header — the route should NOT treat that as an auth error
 * directly; the session-cookie fallback runs after.
 */
function extractBearer(req: NextRequest): string | null {
  const raw = req.headers.get("authorization");
  if (!raw) return null;
  const m = /^Bearer\s+(.+)$/i.exec(raw.trim());
  if (!m) return null;
  const tok = m[1].trim();
  return tok.length > 0 ? tok : null;
}
