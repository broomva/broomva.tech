import { NextResponse } from "next/server";
import { z } from "zod";

import { withAuth, withAuthAndValidation } from "@/lib/api/with-auth";
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
export const GET = withAuth(async (_request, { userId }) => {
  try {
    const orgs = await getUserOrganizations(userId);

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
});

const createOrgSchema = z.object({
  name: z.string().min(1, "Name is required"),
  slug: z.string().min(1, "Slug is required"),
});

/**
 * POST /api/organization — create a new organization
 * Body: { name: string, slug: string }
 */
export const POST = withAuthAndValidation(
  createOrgSchema,
  async (_request, { userId, body }) => {
    const { name, slug } = body;

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
        userId,
      );

      logAudit({
        organizationId: org.id,
        actorId: userId,
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
  },
);
