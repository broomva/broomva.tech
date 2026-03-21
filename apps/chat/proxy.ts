import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getSafeSession } from "@/lib/auth";

// ── Public route allowlists (single source of truth) ────────────────────────

/** Pages accessible without authentication. */
const PUBLIC_PAGE_PREFIXES = [
  "/projects",
  "/writing",
  "/notes",
  "/start-here",
  "/now",
  "/contact",
  "/prompts",
  "/share/",
  "/privacy",
  "/terms",
  "/pricing",
  "/skills",
] as const;

const PUBLIC_PAGE_EXACT = ["/", "/chat"] as const;

/** API routes that bypass auth (auth endpoints, public data). */
const PUBLIC_API_PREFIXES = [
  "/api/auth",
  "/api/trpc",
  "/api/chat",
  "/api/skills",
  "/api/search",
  "/api/context",
  "/api/llms",
  "/api/prompts",
] as const;

/** Metadata / SEO routes always allowed. */
const METADATA_ROUTES = [
  "/sitemap.xml",
  "/robots.txt",
  "/manifest.webmanifest",
  "/llms.txt",
  "/llms-full.txt",
] as const;

// ── Route classifiers ───────────────────────────────────────────────────────

function isPublicPage(pathname: string): boolean {
  if ((PUBLIC_PAGE_EXACT as readonly string[]).includes(pathname)) {
    return true;
  }
  return PUBLIC_PAGE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function isPublicApiRoute(pathname: string): boolean {
  return PUBLIC_API_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function isMetadataRoute(pathname: string): boolean {
  return (METADATA_ROUTES as readonly string[]).includes(pathname);
}

function isAuthPage(pathname: string): boolean {
  return pathname.startsWith("/login") || pathname.startsWith("/register");
}

// ── Security headers ────────────────────────────────────────────────────────

function withSecurityHeaders(response?: NextResponse): NextResponse {
  const res = response ?? NextResponse.next();

  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("X-DNS-Prefetch-Control", "off");
  res.headers.set(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains",
  );
  res.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(self), geolocation=()",
  );

  return res;
}

// ── Proxy function (Next.js 16 middleware) ──────────────────────────────────

export async function proxy(req: NextRequest) {
  const url = req.nextUrl;
  const { pathname } = url;

  // Always allow metadata, public pages, and public API routes
  if (
    isMetadataRoute(pathname) ||
    isPublicPage(pathname) ||
    isPublicApiRoute(pathname)
  ) {
    return withSecurityHeaders();
  }

  // Auth pages need a session check to redirect logged-in users away
  const { data: session } = await getSafeSession({
    fetchOptions: { headers: req.headers },
  });
  const isLoggedIn = !!session?.user;

  if (isAuthPage(pathname)) {
    if (isLoggedIn) {
      return withSecurityHeaders(
        NextResponse.redirect(new URL("/", url)),
      );
    }
    return withSecurityHeaders();
  }

  // Block all other routes for unauthenticated users
  if (!isLoggedIn) {
    return withSecurityHeaders(
      NextResponse.redirect(new URL("/login", url)),
    );
  }

  return withSecurityHeaders();
}

// ── Matcher: only exclude static assets and build artifacts ─────────────────
// Page-level access is handled entirely by the allowlists above,
// so the matcher only needs to skip files the proxy should never touch.

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|opengraph-image|manifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|json|webmanifest|txt|mp4|webm|ogg|pdf)$).*)",
  ],
};
