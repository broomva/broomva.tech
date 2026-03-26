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
  "/agents",
  "/graph",
  "/links",
  "/ingest",
  "/.well-known",
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
  "/api/discovery",
  "/api/trust",
  "/api/marketplace",
  "/api/assets",
  "/api/graph/public",
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

// ── Subdomain detection ────────────────────────────────────────────────────

/** Known subdomains that are NOT tenant slugs. */
const NON_TENANT_SUBDOMAINS = new Set([
  "www",
  "api",
  "app",
  "chat",
  "admin",
  "console",
  "status",
  "docs",
]);

/**
 * Extract a tenant slug from the request hostname.
 *
 * Production: `{slug}.broomva.tech`
 * Development: `{slug}.localhost` (any port)
 *
 * Returns the slug string or null if the hostname is bare / non-tenant.
 */
function extractTenantSlug(req: NextRequest): string | null {
  // Prefer x-forwarded-host (set by reverse proxies / load balancers),
  // fall back to the Host header.
  const host =
    req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";

  // Strip port if present
  const hostname = host.split(":")[0];

  // Match `<slug>.broomva.tech` or `<slug>.localhost`
  const match = hostname.match(
    /^([a-z0-9-]+)\.(broomva\.tech|localhost)$/i,
  );
  if (!match) return null;

  const slug = match[1].toLowerCase();

  if (NON_TENANT_SUBDOMAINS.has(slug)) return null;

  return slug;
}

// ── Proxy function (Next.js 16 middleware) ──────────────────────────────────

export async function proxy(req: NextRequest) {
  const url = req.nextUrl;
  const { pathname } = url;

  // ── Wildcard subdomain detection ──────────────────────────────────────
  // If the request arrives on a tenant subdomain (e.g. acme.broomva.tech),
  // stamp the slug onto a request header so downstream code
  // (tenant-context.ts, API routes) can resolve the organization without
  // re-parsing the hostname.
  const tenantSlug = extractTenantSlug(req);

  /**
   * Helper: create a NextResponse.next() that forwards the tenant slug
   * as a request header when present.  All exit paths should use this
   * instead of bare `NextResponse.next()`.
   */
  function nextWithTenant(): NextResponse {
    if (!tenantSlug) return NextResponse.next();

    const requestHeaders = new Headers(req.headers);
    requestHeaders.set("x-tenant-slug", tenantSlug);
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // Always allow metadata, public pages, and public API routes
  if (
    isMetadataRoute(pathname) ||
    isPublicPage(pathname) ||
    isPublicApiRoute(pathname)
  ) {
    return withSecurityHeaders(nextWithTenant());
  }

  // Auth pages need a session check to redirect logged-in users away
  const { data: session } = await getSafeSession({
    fetchOptions: { headers: req.headers },
  });
  const isLoggedIn = !!session?.user;

  if (isAuthPage(pathname)) {
    if (isLoggedIn) {
      // If logged-in user arrives with ?plan= (e.g., from /pricing CTA),
      // redirect to billing page to trigger checkout instead of home.
      const plan = url.searchParams.get("plan");
      if (plan && (pathname === "/login" || pathname === "/register")) {
        return withSecurityHeaders(
          NextResponse.redirect(new URL(`/console/billing?plan=${plan}`, url)),
        );
      }
      return withSecurityHeaders(
        NextResponse.redirect(new URL("/", url)),
      );
    }
    return withSecurityHeaders(nextWithTenant());
  }

  // Block all other routes for unauthenticated users.
  // Preserve ?plan= so the pricing → login → onboarding → billing flow works.
  if (!isLoggedIn) {
    const plan = url.searchParams.get("plan");
    const loginUrl = new URL("/login", url);
    if (plan) loginUrl.searchParams.set("plan", plan);
    return withSecurityHeaders(NextResponse.redirect(loginUrl));
  }

  return withSecurityHeaders(nextWithTenant());
}

// ── Matcher: only exclude static assets and build artifacts ─────────────────
// Page-level access is handled entirely by the allowlists above,
// so the matcher only needs to skip files the proxy should never touch.

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|opengraph-image|manifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|json|webmanifest|txt|mp4|webm|ogg|pdf)$).*)",
  ],
};

/** Alias expected by the proxy-security-check CI step. */
export const proxyConfig = config;
