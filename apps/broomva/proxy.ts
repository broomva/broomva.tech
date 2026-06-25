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
  "/profile",
  "/share/",
  "/privacy",
  "/terms",
  "/pricing",
  "/skills",
  // Swapit commons (BRO-1547): the public household-toxics where-to-buy dataset.
  // The page is read-only and renders only approved, corroborated facts — never
  // any private inventory — so anonymous viewers must reach it.
  "/swapit",
  "/agents",
  "/graph",
  "/links",
  "/ingest",
  "/life",
  // Public artifact sharing: route handlers still enforce row-level
  // visibility. The proxy must let anonymous viewers reach them.
  "/d/",
  "/h/",
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
  // Docs publishing (BRO-1293): the broomva CLI publishes HTML specs with a
  // Bearer token and no session cookie. The proxy must let /api/docs and
  // /api/docs/[id] through so the handler can self-authenticate via
  // resolveAuth (Bearer Life JWT OR session cookie). It returns 401 when
  // neither is present, so it is not actually public.
  "/api/docs",
  // Handoff queue (BRO-1415/BRO-1418): like /api/docs, the broomva CLI pushes
  // handoffs and drives their lifecycle with a Bearer token and no session
  // cookie. The proxy must let /api/handoffs, /api/handoffs/[id], and the SSE
  // /api/handoffs/events through so the handler can self-authenticate via
  // resolveAuth (Bearer Life JWT OR session cookie); it returns 401 when
  // neither is present, so it is not actually public. (Missing this entry made
  // every CLI push 307→/login — the redirect external SDK callers can't follow.)
  "/api/handoffs",
  "/api/discovery",
  "/api/trust",
  "/api/marketplace",
  "/api/assets",
  "/api/graph/public",
  "/api/relay",
  "/api/install",
  "/api/debug",
  // Life Runtime: the /api/life/run/[project] route does its own consumer
  // resolution (session | anon | x402) inside the handler and responds
  // with 402 Payment Required when payment is needed. Middleware must let
  // the request through so the handler can pick the right path.
  "/api/life",
  // Prompts eval engine (Phase 1 telemetry plane). These endpoints are
  // anonymous-OK by design — the CLI and Claude Code skill emit
  // invocation beacons from terminals that may have no session cookie.
  // Per-IP and per-user rate limits enforced inside each handler.
  "/api/invocations",
  "/api/feedback",
  "/api/metrics",
  // Swapit commons (BRO-1547): the anonymized household-toxics knowledge commons.
  // GET serves only approved facts (browse/pull from the skill's `swapit sync`);
  // POST contributes a generic, content-addressed fact. Anonymous-OK by design —
  // the `swapit` CLI syncs from terminals with no session cookie. The handler does
  // its own trust enforcement (per-kind Zod, the scanForbidden privacy backstop,
  // payload-size caps, server-derived contributor identity = session user OR client
  // IP) and per-IP/per-user rate limits, so it MUST NOT 307→/login (the CLI can't
  // follow an HTML auth redirect). Private inventory never reaches here.
  "/api/swapit",
  // Infra health probes (e.g. /api/health/redis): status-only JSON (no
  // secrets), polled by dogfood / uptime checks from terminals with no
  // session cookie. Must not 307→/login or external probes can't read it.
  "/api/health",
  // Audio narration: every blog/project post has a "Listen to post" player.
  // The handler stores per-user resume position when signed in, but degrades
  // to no-op for anonymous readers (`NextResponse.json(null)` on GET, 401 on
  // POST). The proxy must let the request through so the handler can pick.
  "/api/audio-playback",
  // Edge endpoints (BRO-1208): Anthropic Messages + OpenAI Chat Completions
  // canonical surfaces. Both routes do their own Tier-1 JWT verification
  // inside the handler — header bearer (BROOMVA_TOKEN / Tier-1 cap) OR
  // Neon Auth session → minted Tier-1 — and return Anthropic/OpenAI-shape
  // 401 JSON envelopes when auth is missing. They MUST NOT be redirected
  // to /login because external SDK callers (curl, @anthropic-ai/sdk,
  // openai) cannot follow HTML auth redirects.
  "/api/v1",
] as const;

/** Metadata / SEO routes always allowed. */
const METADATA_ROUTES = [
  "/sitemap.xml",
  "/robots.txt",
  "/manifest.webmanifest",
  "/llms.txt",
  "/llms-full.txt",
] as const;

// ── CORS allowlist for /api/* (absorbed from former middleware.ts) ──────────
//
// Next.js 16 disallows having BOTH `middleware.ts` and `proxy.ts`. The CORS
// allowlist that previously lived in middleware.ts is folded into proxy.ts
// here so we keep one source of truth (Next.js will fail to build otherwise).
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
//   - OPTIONS preflight to /api/* → 204 with CORS headers when origin allowed,
//     empty 204 otherwise (browser fails its end — standard CORS posture).
//   - Other methods to /api/* → forward to handler; CORS headers appended
//     to the final response when origin allowed.
//   - Non-/api/* paths get no CORS treatment (HTML pages don't need it).

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
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

function isLocalhostOrigin(origin: string): boolean {
  if (process.env.NODE_ENV === "production") return false;
  try {
    const u = new URL(origin);
    return (
      (u.hostname === "localhost" || u.hostname === "127.0.0.1") &&
      (u.protocol === "http:" || u.protocol === "https:")
    );
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

function withSecurityHeaders(
  req: NextRequest,
  response?: NextResponse,
): NextResponse {
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

  // Append dynamic CORS headers when the request targets /api/* and the
  // request Origin is on the allowlist. Non-/api/* requests and disallowed
  // origins get no CORS headers — the browser silently fails its end, which
  // is the standard posture.
  const origin = req.headers.get("origin");
  if (req.nextUrl.pathname.startsWith("/api/") && isAllowedOrigin(origin)) {
    applyCorsHeaders(res.headers, origin as string);
  }

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
  const match = hostname.match(/^([a-z0-9-]+)\.(broomva\.tech|localhost)$/i);
  if (!match) return null;

  const slug = match[1].toLowerCase();

  if (NON_TENANT_SUBDOMAINS.has(slug)) return null;

  return slug;
}

// ── Proxy function (Next.js 16 middleware) ──────────────────────────────────

export async function proxy(req: NextRequest) {
  const url = req.nextUrl;
  const { pathname } = url;

  // ── CORS preflight short-circuit for /api/* ────────────────────────────
  // Return 204 before any auth check so the browser preflight completes
  // without ever hitting the route handler or hitting the /login redirect
  // path. Disallowed origins get an empty 204 (no CORS headers) and the
  // browser fails its end — the standard posture for unwhitelisted origins.
  if (req.method === "OPTIONS" && pathname.startsWith("/api/")) {
    const origin = req.headers.get("origin");
    const res = new NextResponse(null, { status: 204 });
    if (isAllowedOrigin(origin)) {
      applyCorsHeaders(res.headers, origin as string);
    }
    return res;
  }

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
    return withSecurityHeaders(req, nextWithTenant());
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
          req,
          NextResponse.redirect(new URL(`/console/billing?plan=${plan}`, url)),
        );
      }
      return withSecurityHeaders(req, NextResponse.redirect(new URL("/", url)));
    }
    return withSecurityHeaders(req, nextWithTenant());
  }

  // Block all other routes for unauthenticated users.
  // Preserve ?plan= so the pricing → login → onboarding → billing flow works.
  if (!isLoggedIn) {
    const plan = url.searchParams.get("plan");
    const loginUrl = new URL("/login", url);
    if (plan) loginUrl.searchParams.set("plan", plan);
    return withSecurityHeaders(req, NextResponse.redirect(loginUrl));
  }

  return withSecurityHeaders(req, nextWithTenant());
}

// ── Matcher: only exclude static assets and build artifacts ─────────────────
// Page-level access is handled entirely by the allowlists above,
// so the matcher only needs to skip files the proxy should never touch.

export const config = {
  matcher: [
    // Skip the proxy for static assets and build artifacts. The extension
    // list intentionally includes audio (mp3/wav/m4a) and video (mp4/webm/ogg)
    // because those resources are public — they were originally served as
    // committed static files under public/, and after the Lago migration
    // (apps/broomva/app/api/assets) they need to keep bypassing auth so the
    // /audio/* and /video/* rewrites in next.config.ts can reach /api/assets.
    "/((?!_next/static|_next/image|favicon.ico|opengraph-image|manifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|json|webmanifest|txt|mp4|webm|ogg|mp3|wav|m4a|pdf)$).*)",
  ],
};

/** Alias expected by the proxy-security-check CI step. */
export const proxyConfig = config;
