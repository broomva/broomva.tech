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
