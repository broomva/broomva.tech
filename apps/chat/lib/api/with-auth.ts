import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getSafeSession, type Session } from "@/lib/auth";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The verified auth context passed to handlers wrapped with `withAuth`. */
export interface AuthContext {
  userId: string;
  email: string | null;
  session: NonNullable<Session>;
}

/** A Next.js App Router route handler signature. */
type RouteHandler = (request: Request) => Promise<Response>;

/** Handler that receives the authenticated context. */
type AuthHandler = (
  request: Request,
  ctx: AuthContext,
) => Promise<Response>;

/** Handler that receives both auth context and a validated body. */
type AuthValidatedHandler<T> = (
  request: Request,
  ctx: AuthContext & { body: T },
) => Promise<Response>;

/** Handler that receives only a validated body (no auth required). */
type ValidatedHandler<T> = (
  request: Request,
  ctx: { body: T },
) => Promise<Response>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const isDev = process.env.NODE_ENV !== "production";

function errorResponse(
  message: string,
  status: number,
  details?: unknown,
): Response {
  const payload: Record<string, unknown> = { error: message };
  if (isDev && details) {
    payload.details = details instanceof Error ? details.message : details;
  }
  return NextResponse.json(payload, { status });
}

async function parseJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// withAuth — session gate
// ---------------------------------------------------------------------------

/**
 * Wraps a route handler with session authentication.
 *
 * If the session is missing or invalid the caller receives a `401`.
 * Otherwise the handler is invoked with `{ userId, email, session }`.
 *
 * @example
 * ```ts
 * export const GET = withAuth(async (request, { userId, session }) => {
 *   const data = await fetchUserData(userId);
 *   return NextResponse.json({ data });
 * });
 * ```
 */
export function withAuth(handler: AuthHandler): RouteHandler {
  return async (request: Request) => {
    try {
      const { data: session } = await getSafeSession({
        fetchOptions: { headers: await headers() },
      });

      if (!session?.user?.id) {
        return errorResponse("Not authenticated", 401);
      }

      const ctx: AuthContext = {
        userId: session.user.id,
        email: session.user.email ?? null,
        session,
      };

      return await handler(request, ctx);
    } catch (err) {
      console.error("[withAuth] Unhandled error:", err);
      return errorResponse("Internal server error", 500, err);
    }
  };
}

// ---------------------------------------------------------------------------
// withValidation — body parsing + Zod validation
// ---------------------------------------------------------------------------

/**
 * Wraps a route handler with Zod body validation.
 *
 * Parses the request JSON body and validates it against the provided schema.
 * Returns `400` with structured errors on failure, or passes the typed body
 * to the handler on success.
 *
 * @example
 * ```ts
 * const schema = z.object({ name: z.string().min(1) });
 *
 * export const POST = withValidation(schema, async (request, { body }) => {
 *   // body is typed as { name: string }
 *   return NextResponse.json({ created: body.name });
 * });
 * ```
 */
export function withValidation<T extends z.ZodType>(
  schema: T,
  handler: ValidatedHandler<z.infer<T>>,
): RouteHandler {
  return async (request: Request) => {
    try {
      const raw = await parseJsonBody(request);

      if (raw === undefined) {
        return errorResponse("Invalid or missing JSON body", 400);
      }

      const result = schema.safeParse(raw);

      if (!result.success) {
        return errorResponse("Validation failed", 400, result.error.issues);
      }

      return await handler(request, { body: result.data as z.infer<T> });
    } catch (err) {
      console.error("[withValidation] Unhandled error:", err);
      return errorResponse("Internal server error", 500, err);
    }
  };
}

// ---------------------------------------------------------------------------
// withAuthAndValidation — auth + body validation composed
// ---------------------------------------------------------------------------

/**
 * Composes `withAuth` and `withValidation` — the handler receives both the
 * authenticated context *and* the validated, typed request body.
 *
 * @example
 * ```ts
 * const schema = z.object({
 *   plan: z.enum(["pro", "team"]),
 *   organizationId: z.string().uuid(),
 * });
 *
 * export const POST = withAuthAndValidation(schema, async (request, ctx) => {
 *   // ctx.userId, ctx.email, ctx.session, ctx.body.plan, ctx.body.organizationId
 *   return NextResponse.json({ ok: true });
 * });
 * ```
 */
export function withAuthAndValidation<T extends z.ZodType>(
  schema: T,
  handler: AuthValidatedHandler<z.infer<T>>,
): RouteHandler {
  return async (request: Request) => {
    try {
      // --- Auth ---
      const { data: session } = await getSafeSession({
        fetchOptions: { headers: await headers() },
      });

      if (!session?.user?.id) {
        return errorResponse("Not authenticated", 401);
      }

      // --- Validation ---
      const raw = await parseJsonBody(request);

      if (raw === undefined) {
        return errorResponse("Invalid or missing JSON body", 400);
      }

      const result = schema.safeParse(raw);

      if (!result.success) {
        return errorResponse("Validation failed", 400, result.error.issues);
      }

      const ctx: AuthContext & { body: z.infer<T> } = {
        userId: session.user.id,
        email: session.user.email ?? null,
        session,
        body: result.data as z.infer<T>,
      };

      return await handler(request, ctx);
    } catch (err) {
      console.error("[withAuthAndValidation] Unhandled error:", err);
      return errorResponse("Internal server error", 500, err);
    }
  };
}

// ---------------------------------------------------------------------------
// withRelayAuth — session OR relay API key
// ---------------------------------------------------------------------------

/**
 * Auth context for relay daemon requests.
 * When authenticated via API key, userId is a synthetic daemon identifier.
 */
export interface RelayAuthContext {
  userId: string;
  isDaemon: boolean;
}

/**
 * Extracts the Bearer token from the Authorization header.
 */
function extractBearer(request: Request): string | null {
  const auth = request.headers.get("authorization") ?? "";
  if (auth.startsWith("Bearer ")) return auth.slice(7).trim();
  return null;
}

/**
 * Wraps a relay route handler with dual auth: valid session OR RELAY_API_KEY.
 * Used by all /api/relay/* routes so that the relayd daemon (which sends an
 * API key Bearer token) and browser users (session cookies) both work.
 */
export function withRelayAuth(
  handler: (request: Request, ctx: RelayAuthContext) => Promise<Response>,
): RouteHandler {
  return async (request: Request) => {
    try {
      // 1. Check for relay daemon API key
      const relayApiKey = process.env.RELAY_API_KEY;
      const bearer = extractBearer(request);
      if (relayApiKey && bearer === relayApiKey) {
        return await handler(request, { userId: "relay-daemon", isDaemon: true });
      }

      // 2. Fall back to session auth
      const { data: session } = await getSafeSession({
        fetchOptions: { headers: await headers() },
      });
      if (!session?.user?.id) {
        return errorResponse("Not authenticated", 401);
      }
      return await handler(request, { userId: session.user.id, isDaemon: false });
    } catch (err) {
      console.error("[withRelayAuth] Unhandled error:", err);
      return errorResponse("Internal server error", 500, err);
    }
  };
}

/**
 * Combines relay auth (session OR API key) with Zod body validation.
 */
export function withRelayAuthAndValidation<T extends z.ZodType>(
  schema: T,
  handler: (
    request: Request,
    ctx: RelayAuthContext & { body: z.infer<T> },
  ) => Promise<Response>,
): RouteHandler {
  return async (request: Request) => {
    try {
      // --- Auth ---
      const relayApiKey = process.env.RELAY_API_KEY;
      const bearer = extractBearer(request);
      let authCtx: RelayAuthContext;
      if (relayApiKey && bearer === relayApiKey) {
        authCtx = { userId: "relay-daemon", isDaemon: true };
      } else {
        const { data: session } = await getSafeSession({
          fetchOptions: { headers: await headers() },
        });
        if (!session?.user?.id) {
          return errorResponse("Not authenticated", 401);
        }
        authCtx = { userId: session.user.id, isDaemon: false };
      }

      // --- Validation ---
      const raw = await parseJsonBody(request);
      if (raw === undefined) {
        return errorResponse("Invalid or missing JSON body", 400);
      }
      const result = schema.safeParse(raw);
      if (!result.success) {
        return errorResponse("Validation failed", 400, result.error.issues);
      }

      return await handler(request, { ...authCtx, body: result.data as z.infer<T> });
    } catch (err) {
      console.error("[withRelayAuthAndValidation] Unhandled error:", err);
      return errorResponse("Internal server error", 500, err);
    }
  };
}
