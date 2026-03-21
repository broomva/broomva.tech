import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { and, eq, isNull } from "drizzle-orm";
import { getSafeSession } from "@/lib/auth";
import { db } from "@/lib/db/client";
import {
  organization,
  organizationApiKey,
  organizationMember,
} from "@/lib/db/schema";

export type TenantSource = "api_key" | "subdomain" | "session";

export interface TenantContext {
  organizationId: string;
  userId: string | null;
  role: string;
  source: TenantSource;
}

/**
 * Hash an API key using SHA-256 for comparison against stored hashes.
 * API keys are high-entropy random strings so SHA-256 is sufficient
 * (bcrypt would be overkill).
 */
function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/**
 * Resolve tenant context from an incoming request.
 *
 * Resolution order:
 * 1. API key header (`x-api-key` or `Authorization: Bearer brv_sk_...`)
 * 2. Subdomain (`alice.broomva.tech`)
 * 3. Session — look up user's primary (first) organization
 *
 * Returns null if no tenant can be resolved.
 */
export async function resolveTenantFromRequest(
  request: Request,
): Promise<TenantContext | null> {
  // --- 1. API key ---
  const apiKeyResult = await resolveFromApiKey(request);
  if (apiKeyResult) return apiKeyResult;

  // --- 2. Subdomain ---
  const subdomainResult = await resolveFromSubdomain(request);
  if (subdomainResult) return subdomainResult;

  // --- 3. Session ---
  const sessionResult = await resolveFromSession();
  if (sessionResult) return sessionResult;

  return null;
}

/**
 * Try to resolve tenant from an API key.
 * Checks `x-api-key` header first, then `Authorization: Bearer brv_sk_...`.
 */
async function resolveFromApiKey(
  request: Request,
): Promise<TenantContext | null> {
  let rawKey: string | null = null;

  // Check x-api-key header
  const xApiKey = request.headers.get("x-api-key");
  if (xApiKey) {
    rawKey = xApiKey;
  }

  // Check Authorization header for brv_sk_ prefixed keys
  if (!rawKey) {
    const authHeader = request.headers.get("authorization");
    if (authHeader?.startsWith("Bearer brv_sk_")) {
      rawKey = authHeader.slice(7); // strip "Bearer "
    }
  }

  if (!rawKey) return null;

  try {
    const keyHash = hashApiKey(rawKey);

    const [row] = await db
      .select({
        id: organizationApiKey.id,
        organizationId: organizationApiKey.organizationId,
        createdByUserId: organizationApiKey.createdByUserId,
        scopes: organizationApiKey.scopes,
        revokedAt: organizationApiKey.revokedAt,
        expiresAt: organizationApiKey.expiresAt,
      })
      .from(organizationApiKey)
      .where(
        and(
          eq(organizationApiKey.keyHash, keyHash),
          isNull(organizationApiKey.revokedAt),
        ),
      )
      .limit(1);

    if (!row) return null;

    // Check expiration
    if (row.expiresAt && row.expiresAt < new Date()) return null;

    // Update lastUsedAt in the background (fire-and-forget)
    db.update(organizationApiKey)
      .set({ lastUsedAt: new Date() })
      .where(eq(organizationApiKey.id, row.id))
      .then(() => {})
      .catch(() => {});

    return {
      organizationId: row.organizationId,
      userId: row.createdByUserId,
      role: "api_key",
      source: "api_key",
    };
  } catch {
    return null;
  }
}

/**
 * Try to resolve tenant from subdomain (e.g., `alice.broomva.tech`).
 */
async function resolveFromSubdomain(
  request: Request,
): Promise<TenantContext | null> {
  try {
    const host = request.headers.get("host");
    if (!host) return null;

    // Strip port if present
    const hostname = host.split(":")[0];

    // Match `<slug>.broomva.tech` or `<slug>.localhost`
    const match = hostname.match(
      /^([a-z0-9-]+)\.(broomva\.tech|localhost)$/i,
    );
    if (!match) return null;

    const slug = match[1].toLowerCase();

    // Ignore known non-tenant subdomains
    const nonTenantSubdomains = ["www", "api", "app", "chat", "admin", "console", "status", "docs"];
    if (nonTenantSubdomains.includes(slug)) return null;

    const [org] = await db
      .select({ id: organization.id })
      .from(organization)
      .where(eq(organization.slug, slug))
      .limit(1);

    if (!org) return null;

    return {
      organizationId: org.id,
      userId: null,
      role: "viewer",
      source: "subdomain",
    };
  } catch {
    return null;
  }
}

/**
 * Try to resolve tenant from the current session user's primary organization.
 */
async function resolveFromSession(): Promise<TenantContext | null> {
  try {
    const { data: sessionData } = await getSafeSession({
      fetchOptions: { headers: await headers() },
    });

    const userId = sessionData?.user?.id;
    if (!userId) return null;

    // Get the user's first organization membership (most recently joined)
    const [membership] = await db
      .select({
        organizationId: organizationMember.organizationId,
        role: organizationMember.role,
      })
      .from(organizationMember)
      .where(eq(organizationMember.userId, userId))
      .limit(1);

    if (!membership) return null;

    return {
      organizationId: membership.organizationId,
      userId,
      role: membership.role,
      source: "session",
    };
  } catch {
    return null;
  }
}

/**
 * High-level helper that combines auth session with organization resolution.
 * Intended for use in server components and API routes.
 *
 * Returns the session user info plus the resolved tenant context (if any).
 */
export async function getTenantContext(): Promise<{
  userId: string | null;
  email: string | null;
  tenant: TenantContext | null;
}> {
  const { data: sessionData } = await getSafeSession({
    fetchOptions: { headers: await headers() },
  });

  const userId = sessionData?.user?.id ?? null;
  const email = sessionData?.user?.email ?? null;

  if (!userId) {
    return { userId: null, email: null, tenant: null };
  }

  // Resolve the user's primary organization
  const [membership] = await db
    .select({
      organizationId: organizationMember.organizationId,
      role: organizationMember.role,
    })
    .from(organizationMember)
    .where(eq(organizationMember.userId, userId))
    .limit(1);

  const tenant: TenantContext | null = membership
    ? {
        organizationId: membership.organizationId,
        userId,
        role: membership.role,
        source: "session",
      }
    : null;

  return { userId, email, tenant };
}
