import { headers } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getSafeSession } from "@/lib/auth";
import { db } from "@/lib/db/client";
import {
  organization,
  organizationLifeInstance,
  organizationMember,
} from "@/lib/db/schema";

// ---------------------------------------------------------------------------
// Service routing table
// ---------------------------------------------------------------------------

/**
 * Maps the first path segment after `/api/platform/proxy/` to the
 * corresponding URL field on OrganizationLifeInstance.
 */
const SERVICE_URL_FIELD = {
  arcan: "arcanUrl",
  lago: "lagoUrl",
  autonomic: "autonomicUrl",
  haima: "haimaUrl",
} as const;

type ServiceKey = keyof typeof SERVICE_URL_FIELD;

function isServiceKey(s: string): s is ServiceKey {
  return s in SERVICE_URL_FIELD;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the authenticated user's organization membership and the
 * tenant's Life instance in a single pass.
 *
 * Resolution order for tenant slug:
 * 1. `x-tenant-slug` request header (set by middleware for subdomain requests)
 * 2. `organizationId` query parameter (explicit selection)
 *
 * Returns an error response or the resolved data.
 */
async function resolveProxyContext(request: NextRequest): Promise<
  | {
      userId: string;
      organizationId: string;
      instance: {
        arcanUrl: string | null;
        lagoUrl: string | null;
        autonomicUrl: string | null;
        haimaUrl: string | null;
        status: string;
      };
    }
  | NextResponse
> {
  const headerStore = await headers();

  const { data: session } = await getSafeSession({
    fetchOptions: { headers: headerStore },
  });

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  // --- Determine organization ---
  const tenantSlug = headerStore.get("x-tenant-slug");
  const orgIdParam = request.nextUrl.searchParams.get("organizationId");

  let organizationId: string | null = null;

  if (tenantSlug) {
    // Resolve slug to organization ID
    const [org] = await db
      .select({ id: organization.id })
      .from(organization)
      .where(eq(organization.slug, tenantSlug))
      .limit(1);

    if (!org) {
      return NextResponse.json(
        { error: `Organization not found for subdomain: ${tenantSlug}` },
        { status: 404 },
      );
    }
    organizationId = org.id;
  } else if (orgIdParam) {
    organizationId = orgIdParam;
  }

  if (!organizationId) {
    // Fall back to the user's primary organization
    const [membership] = await db
      .select({ organizationId: organizationMember.organizationId })
      .from(organizationMember)
      .where(eq(organizationMember.userId, userId))
      .limit(1);

    if (!membership) {
      return NextResponse.json(
        {
          error:
            "No organization context. Use a tenant subdomain or pass ?organizationId=",
        },
        { status: 400 },
      );
    }
    organizationId = membership.organizationId;
  }

  // --- Verify membership ---
  const [membership] = await db
    .select({ role: organizationMember.role })
    .from(organizationMember)
    .where(
      and(
        eq(organizationMember.organizationId, organizationId),
        eq(organizationMember.userId, userId),
      ),
    )
    .limit(1);

  if (!membership) {
    return NextResponse.json(
      { error: "You are not a member of this organization" },
      { status: 403 },
    );
  }

  // --- Fetch Life instance ---
  const [instance] = await db
    .select({
      arcanUrl: organizationLifeInstance.arcanUrl,
      lagoUrl: organizationLifeInstance.lagoUrl,
      autonomicUrl: organizationLifeInstance.autonomicUrl,
      haimaUrl: organizationLifeInstance.haimaUrl,
      status: organizationLifeInstance.status,
    })
    .from(organizationLifeInstance)
    .where(eq(organizationLifeInstance.organizationId, organizationId))
    .limit(1);

  if (!instance) {
    return NextResponse.json(
      {
        error: "No Life instance found for this organization",
        hint: "Provision a Life instance via POST /api/platform/life first.",
      },
      { status: 404 },
    );
  }

  if (instance.status !== "running") {
    return NextResponse.json(
      {
        error: `Life instance is not running (status: ${instance.status})`,
        hint: "Wait for provisioning to complete or check the instance health.",
      },
      { status: 503 },
    );
  }

  return { userId, organizationId, instance };
}

// ---------------------------------------------------------------------------
// Proxy handler — forwards requests to the tenant's Life service
// ---------------------------------------------------------------------------

async function handler(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: pathSegments } = await params;

  if (!pathSegments || pathSegments.length === 0) {
    return NextResponse.json(
      {
        error: "Missing service path",
        hint: "Use /api/platform/proxy/{arcan|lago|autonomic|haima}/...",
      },
      { status: 400 },
    );
  }

  // First segment is the service name
  const serviceKey = pathSegments[0];
  if (!isServiceKey(serviceKey)) {
    return NextResponse.json(
      {
        error: `Unknown service: ${serviceKey}`,
        available: Object.keys(SERVICE_URL_FIELD),
      },
      { status: 400 },
    );
  }

  // Resolve auth + tenant + Life instance
  const ctx = await resolveProxyContext(request);
  if (ctx instanceof NextResponse) return ctx;

  // Get the upstream URL for this service
  const urlField = SERVICE_URL_FIELD[serviceKey];
  const baseUrl = ctx.instance[urlField];

  if (!baseUrl) {
    return NextResponse.json(
      {
        error: `Service "${serviceKey}" URL is not configured for this organization's Life instance`,
        hint: "The service may not have been provisioned or its URL is missing.",
      },
      { status: 404 },
    );
  }

  // Build the upstream path (everything after the service name)
  const upstreamPath = pathSegments.slice(1).join("/");
  const upstreamUrl = new URL(
    upstreamPath ? `/${upstreamPath}` : "/",
    baseUrl,
  );

  // Forward query parameters
  request.nextUrl.searchParams.forEach((value, key) => {
    // Don't forward our internal parameter
    if (key === "organizationId") return;
    upstreamUrl.searchParams.set(key, value);
  });

  // Build upstream request headers — forward most headers, strip hop-by-hop
  const forwardHeaders = new Headers();
  const hopByHopHeaders = new Set([
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade",
    "host",
  ]);

  request.headers.forEach((value, key) => {
    if (!hopByHopHeaders.has(key.toLowerCase())) {
      forwardHeaders.set(key, value);
    }
  });

  // Inject tenant context headers for the upstream service
  forwardHeaders.set("x-broomva-org-id", ctx.organizationId);
  forwardHeaders.set("x-broomva-user-id", ctx.userId);

  try {
    const upstreamRes = await fetch(upstreamUrl.toString(), {
      method: request.method,
      headers: forwardHeaders,
      body:
        request.method !== "GET" && request.method !== "HEAD"
          ? request.body
          : undefined,
      // @ts-expect-error -- duplex is required for streaming request bodies in Node 18+
      duplex: "half",
    });

    // Build the response, forwarding status and headers from upstream
    const responseHeaders = new Headers();
    upstreamRes.headers.forEach((value, key) => {
      // Skip hop-by-hop and headers we'll set ourselves
      if (hopByHopHeaders.has(key.toLowerCase())) return;
      responseHeaders.set(key, value);
    });

    return new NextResponse(upstreamRes.body, {
      status: upstreamRes.status,
      statusText: upstreamRes.statusText,
      headers: responseHeaders,
    });
  } catch (err) {
    console.error(
      `[platform/proxy] Failed to proxy to ${serviceKey}:`,
      err,
    );

    return NextResponse.json(
      {
        error: `Failed to reach ${serviceKey} service`,
        detail: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 502 },
    );
  }
}

// ---------------------------------------------------------------------------
// Export all methods — the proxy is method-agnostic
// ---------------------------------------------------------------------------

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const OPTIONS = handler;
