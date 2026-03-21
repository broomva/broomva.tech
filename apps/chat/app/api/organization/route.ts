import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { getSafeSession } from "@/lib/auth";
import {
  createOrganization,
  getOrganizationBySlug,
  getUserOrganizations,
  getOrganizationMembers,
} from "@/lib/db/organization";
import { logAudit } from "@/lib/db/audit";
import { PLAN_TIERS, type PlanTier } from "@/lib/stripe";

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/;

const RESERVED_SLUGS = [
  "api",
  "www",
  "admin",
  "console",
  "app",
  "chat",
  "login",
  "signup",
  "auth",
  "status",
  "docs",
  "blog",
  "writing",
  "help",
  "support",
];

/**
 * GET /api/organization — list current user's organizations with member counts and plan info
 */
export async function GET() {
  const { data: session } = await getSafeSession({
    fetchOptions: { headers: await headers() },
  });

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const orgs = await getUserOrganizations(session.user.id);

    // Enrich each org with member count and plan display info
    const enriched = await Promise.all(
      orgs.map(async (org) => {
        const members = await getOrganizationMembers(org.id);
        const tierConfig = PLAN_TIERS[org.plan as PlanTier] ?? PLAN_TIERS.free;

        return {
          id: org.id,
          name: org.name,
          slug: org.slug,
          plan: org.plan,
          planDisplayName: tierConfig.name,
          creditsMonthly: org.planCreditsMonthly,
          creditsRemaining: org.planCreditsRemaining,
          memberCount: members.length,
          role: org.role,
          createdAt: org.createdAt,
        };
      }),
    );

    return NextResponse.json({ organizations: enriched });
  } catch (err) {
    console.error("[organization] Failed to fetch organizations:", err);
    return NextResponse.json(
      { error: "Failed to fetch organizations" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/organization — create a new organization
 * Body: { name: string, slug: string }
 */
export async function POST(request: Request) {
  const { data: session } = await getSafeSession({
    fetchOptions: { headers: await headers() },
  });

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: { name: string; slug: string };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { name, slug } = body;

  if (!name || !slug) {
    return NextResponse.json(
      { error: "Missing required fields: name, slug" },
      { status: 400 },
    );
  }

  const normalizedSlug = slug.toLowerCase().trim();

  // Validate slug format: lowercase, alphanumeric + hyphens, 3-32 chars
  if (!SLUG_RE.test(normalizedSlug)) {
    return NextResponse.json(
      {
        error:
          "Invalid slug: must be 3-32 characters, lowercase alphanumeric and hyphens only, cannot start or end with a hyphen",
      },
      { status: 400 },
    );
  }

  if (RESERVED_SLUGS.includes(normalizedSlug)) {
    return NextResponse.json(
      { error: `Slug "${normalizedSlug}" is reserved` },
      { status: 400 },
    );
  }

  // Check if slug is already taken
  const existing = await getOrganizationBySlug(normalizedSlug);
  if (existing) {
    return NextResponse.json(
      { error: "An organization with this slug already exists" },
      { status: 409 },
    );
  }

  try {
    const org = await createOrganization(
      name.trim(),
      normalizedSlug,
      session.user.id,
    );

    logAudit({
      organizationId: org.id,
      actorId: session.user.id,
      action: "organization.created",
      resourceType: "organization",
      resourceId: org.id,
      metadata: { name: org.name, slug: org.slug },
    });

    return NextResponse.json({ organization: org }, { status: 201 });
  } catch (err) {
    console.error("[organization] Failed to create organization:", err);
    return NextResponse.json(
      { error: "Failed to create organization" },
      { status: 500 },
    );
  }
}
