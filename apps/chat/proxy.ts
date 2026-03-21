import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getSafeSession } from "@/lib/auth";

function isPublicApiRoute(pathname: string): boolean {
  return (
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/trpc") ||
    pathname === "/api/chat" ||
    pathname.startsWith("/api/chat/")
  );
}

function isMetadataRoute(pathname: string): boolean {
  return (
    pathname === "/sitemap.xml" ||
    pathname === "/robots.txt" ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/llms.txt" ||
    pathname === "/llms-full.txt"
  );
}

function isPublicPage(pathname: string): boolean {
  if (pathname === "/") {
    return true;
  }
  return (
    pathname === "/chat" ||
    pathname.startsWith("/projects") ||
    pathname.startsWith("/writing") ||
    pathname.startsWith("/notes") ||
    pathname.startsWith("/start-here") ||
    pathname.startsWith("/now") ||
    pathname.startsWith("/contact") ||
    pathname.startsWith("/prompts") ||
    pathname.startsWith("/share/") ||
    pathname.startsWith("/privacy") ||
    pathname.startsWith("/terms") ||
    pathname.startsWith("/pricing")
  );
}

function isAuthPage(pathname: string): boolean {
  return pathname.startsWith("/login") || pathname.startsWith("/register");
}

export async function proxy(req: NextRequest) {
  const url = req.nextUrl;
  const { pathname } = url;

  // Always allow public API routes, metadata, and public pages
  if (
    isPublicApiRoute(pathname) ||
    isMetadataRoute(pathname) ||
    isPublicPage(pathname)
  ) {
    return;
  }

  // Auth pages (/login, /register) need a session check so we can redirect
  // logged-in users away — don't short-circuit them above
  const { data: session } = await getSafeSession({
    fetchOptions: { headers: req.headers },
  });
  const isLoggedIn = !!session?.user;

  if (isAuthPage(pathname)) {
    // Redirect authenticated users away from login/register
    if (isLoggedIn) {
      return NextResponse.redirect(new URL("/", url));
    }
    // Allow unauthenticated users to reach auth pages
    return;
  }

  // Block all other routes for unauthenticated users
  if (!isLoggedIn) {
    return NextResponse.redirect(new URL("/login", url));
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, opengraph-image (favicon and og image)
     * - manifest files (.json, .webmanifest)
     * - Images and other static assets (.svg, .png, .jpg, .jpeg, .gif, .webp, .ico)
     * - models
     * - compare
     * - docs (Mintlify documentation)
     */
    "/((?!api|docs|_next/static|_next/image|favicon.ico|opengraph-image|manifest|models|compare|privacy|terms|pricing|llms|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|json|webmanifest|txt|mp4|webm|ogg|pdf)$).*)",
  ],
};
