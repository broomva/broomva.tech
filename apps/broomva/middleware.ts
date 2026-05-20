// middleware.ts — Dynamic CORS for /api/* routes.
//
// Replaces the static `Access-Control-Allow-Origin: https://broomva.tech`
// block previously in `next.config.ts`. Static config only supports one
// origin; an allowlist requires runtime echo of the `Origin` request header
// when it matches.
//
// Allowed origins:
//   - https://broomva.tech (canonical)
//   - https://www.broomva.tech (www alias)
//   - https://broomva.github.io (GitHub Pages, e.g. alpine-cabin OSS demo)
//   - http://localhost:* + http://127.0.0.1:* (dev only — NODE_ENV !== production)
//
// Set `BROOMVA_CORS_EXTRA_ORIGINS` (comma-separated) to add ad-hoc origins
// without a redeploy (Railway/Vercel env var). Each entry must be an exact
// origin string (`https://host[:port]`).
//
// Behavior:
//   - OPTIONS preflight → 204 with CORS headers, no further handling.
//   - Other methods → forward to route; append CORS headers if Origin allowed.
//   - Disallowed Origin → no `Access-Control-Allow-Origin` header set; the
//     browser blocks the response. This is intentional — silent denial is
//     the standard CORS posture for non-whitelisted origins.

import { type NextRequest, NextResponse } from "next/server";

const STATIC_ALLOWLIST = new Set([
  "https://broomva.tech",
  "https://www.broomva.tech",
  "https://broomva.github.io",
]);

const ALLOWED_HEADERS = "Content-Type, Authorization, X-Requested-With";
const ALLOWED_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS";
const MAX_AGE_SECONDS = "600"; // 10 minutes — cache preflight cheaply

function envExtraOrigins(): Set<string> {
  const raw = process.env.BROOMVA_CORS_EXTRA_ORIGINS;
  if (!raw) return new Set();
  return new Set(
    raw.split(",").map((s) => s.trim()).filter(Boolean),
  );
}

function isLocalhostOrigin(origin: string): boolean {
  if (process.env.NODE_ENV === "production") return false;
  try {
    const u = new URL(origin);
    return (u.hostname === "localhost" || u.hostname === "127.0.0.1") &&
      (u.protocol === "http:" || u.protocol === "https:");
  } catch {
    return false;
  }
}

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  if (STATIC_ALLOWLIST.has(origin)) return true;
  if (envExtraOrigins().has(origin)) return true;
  if (isLocalhostOrigin(origin)) return true;
  return false;
}

function applyCorsHeaders(headers: Headers, origin: string): void {
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Methods", ALLOWED_METHODS);
  headers.set("Access-Control-Allow-Headers", ALLOWED_HEADERS);
  headers.set("Access-Control-Allow-Credentials", "true");
  headers.set("Access-Control-Max-Age", MAX_AGE_SECONDS);
  // Vary so caches don't return the wrong Origin echo to a different caller.
  headers.append("Vary", "Origin");
}

export function middleware(req: NextRequest) {
  const origin = req.headers.get("origin");
  const allowed = isAllowedOrigin(origin);

  // OPTIONS preflight: respond immediately, do not invoke the route.
  if (req.method === "OPTIONS") {
    if (!allowed || !origin) {
      // Empty 204 — browser will fail the preflight on its end, which is
      // exactly what we want for disallowed origins.
      return new NextResponse(null, { status: 204 });
    }
    const res = new NextResponse(null, { status: 204 });
    applyCorsHeaders(res.headers, origin);
    return res;
  }

  // Non-preflight: forward and decorate the response.
  const res = NextResponse.next();
  if (allowed && origin) {
    applyCorsHeaders(res.headers, origin);
  }
  return res;
}

export const config = {
  // Only run on API routes — CORS isn't relevant for HTML page responses.
  matcher: ["/api/:path*"],
};
