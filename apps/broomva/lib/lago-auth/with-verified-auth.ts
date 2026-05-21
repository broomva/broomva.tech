/**
 * Higher-order wrapper that mounts [`verifyJwt`] on a Next.js route
 * handler. Per handoff D3, this is the chosen mount pattern: a HOC
 * `withVerifiedAuth(handler)` imported per route, NOT a global
 * middleware.
 *
 * Why HOC over middleware (handoff D3):
 *
 *   - Opt-in per route — no risk of accidentally enforcing on
 *     `/api/v2/*` or any non-target route. The side-by-side guarantee
 *     (D4) is preserved by construction: only routes that import
 *     `withVerifiedAuth` consume the lago-auth verifier.
 *   - Inspectable in the route file — the auth choice is visible
 *     next to the handler, not buried in `middleware.ts`.
 *   - Composable with existing patterns — `resolveEdgeAuth` in
 *     `lib/life-runtime/edge-adapter/auth.ts` (Better Auth path) stays
 *     untouched; this lives next to it as a sibling.
 *
 * Bundle constraint: `lib/lago-auth/*` is `server-only`. It MUST NOT
 * leak into client JS chunks. PR's P11 check verifies this via
 * `bun run build` + chunk grep.
 */

import "server-only";

import { type NextRequest, NextResponse } from "next/server";
import { JwtError, type VerifiedAgentJwt, verifyJwt } from "./verify-jwt";
import type { JournalResolver } from "./rotation-chain";

/**
 * The route-handler shape `withVerifiedAuth` wraps. Production handlers
 * read `verified` (the decoded JWT) to authorize the call before
 * doing the route-specific work.
 */
export type VerifiedRouteHandler = (
  req: NextRequest,
  context: { verified: VerifiedAgentJwt },
) => Promise<Response> | Response;

/**
 * Configuration for the HOC. Most production routes will pass only the
 * `journal` resolver.
 *
 *   - `journal` — the `JournalResolver` instance to use; usually a
 *     module-scope `LifegwJournalResolver` so cache state is shared
 *     across requests in the same Edge / Node worker
 *   - `getBearer` — DI seam for tests. Default extracts the
 *     `Authorization: Bearer <token>` header.
 *   - `unauthorized` — DI seam for error-envelope shaping (Anthropic
 *     vs OpenAI vs plain JSON). Default returns a plain JSON
 *     `{ error: "..." }` with status 401.
 */
export interface WithVerifiedAuthConfig {
  readonly journal: JournalResolver;
  readonly getBearer?: (req: NextRequest) => string | null;
  readonly unauthorized?: (message: string) => Response;
}

function defaultGetBearer(req: NextRequest): string | null {
  const raw = req.headers.get("authorization");
  if (typeof raw !== "string") {
    return null;
  }
  const match = raw.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

function defaultUnauthorized(message: string): Response {
  return NextResponse.json(
    { error: { type: "authentication_error", message } },
    { status: 401 },
  );
}

/**
 * Wrap a route handler with lago-auth Agent JWT verification.
 *
 * Usage:
 *
 *   import { withVerifiedAuth } from "@/lib/lago-auth";
 *   import { LifegwJournalResolver } from "@/lib/lago-auth";
 *
 *   const journal = new LifegwJournalResolver({
 *     baseUrl: process.env.LIFED_GATEWAY_URL!,
 *   });
 *
 *   export const POST = withVerifiedAuth({ journal }, async (req, ctx) => {
 *     // ctx.verified.kidDid, ctx.verified.effectiveDid, ctx.verified.claims
 *     ...
 *   });
 */
export function withVerifiedAuth(
  config: WithVerifiedAuthConfig,
  handler: VerifiedRouteHandler,
): (req: NextRequest) => Promise<Response> {
  const getBearer = config.getBearer ?? defaultGetBearer;
  const unauthorized = config.unauthorized ?? defaultUnauthorized;
  return async (req: NextRequest): Promise<Response> => {
    const bearer = getBearer(req);
    if (bearer === null) {
      return unauthorized(
        "Authentication required: provide an Authorization: Bearer <agent-jwt> header.",
      );
    }
    let verified: VerifiedAgentJwt;
    try {
      verified = await verifyJwt(bearer, config.journal);
    } catch (e) {
      if (e instanceof JwtError) {
        return unauthorized(e.message);
      }
      const reason = e instanceof Error ? e.message : String(e);
      return unauthorized(`agent jwt verify: ${reason}`);
    }
    return handler(req, { verified });
  };
}
