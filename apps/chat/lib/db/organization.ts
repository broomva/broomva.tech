import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "./client";
import {
  organization,
  organizationMember,
  user,
  type Organization,
  type OrganizationMember,
} from "./schema";

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
 * Create an organization and add the creator as owner in a single transaction.
 */
export async function createOrganization(
  name: string,
  slug: string,
  userId: string,
): Promise<Organization> {
  const normalizedSlug = slug.toLowerCase().trim();

  if (RESERVED_SLUGS.includes(normalizedSlug)) {
    throw new Error(`Slug "${normalizedSlug}" is reserved`);
  }

  return db.transaction(async (tx) => {
    const [org] = await tx
      .insert(organization)
      .values({ name, slug: normalizedSlug })
      .returning();

    await tx.insert(organizationMember).values({
      organizationId: org.id,
      userId,
      role: "owner",
    });

    return org;
  });
}

/**
 * Look up an organization by its unique slug.
 */
export async function getOrganizationBySlug(
  slug: string,
): Promise<Organization | undefined> {
  const [org] = await db
    .select()
    .from(organization)
    .where(eq(organization.slug, slug.toLowerCase().trim()))
    .limit(1);

  return org;
}

/**
 * Look up an organization by ID.
 */
export async function getOrganizationById(
  id: string,
): Promise<Organization | undefined> {
  const [org] = await db
    .select()
    .from(organization)
    .where(eq(organization.id, id))
    .limit(1);

  return org;
}

/**
 * Check if a user is a member of an organization.
 */
export async function isOrganizationMember(
  userId: string,
  orgId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: organizationMember.id })
    .from(organizationMember)
    .where(
      and(
        eq(organizationMember.organizationId, orgId),
        eq(organizationMember.userId, userId),
      ),
    )
    .limit(1);

  return !!row;
}

/**
 * List all organizations a user belongs to (most recently joined first).
 */
export async function getUserOrganizations(
  userId: string,
): Promise<Array<Organization & { role: OrganizationMember["role"] }>> {
  const rows = await db
    .select({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      plan: organization.plan,
      stripeCustomerId: organization.stripeCustomerId,
      stripeSubscriptionId: organization.stripeSubscriptionId,
      planCreditsMonthly: organization.planCreditsMonthly,
      planCreditsRemaining: organization.planCreditsRemaining,
      billingPeriodStart: organization.billingPeriodStart,
      neonBranchId: organization.neonBranchId,
      createdAt: organization.createdAt,
      updatedAt: organization.updatedAt,
      role: organizationMember.role,
    })
    .from(organizationMember)
    .innerJoin(
      organization,
      eq(organizationMember.organizationId, organization.id),
    )
    .where(eq(organizationMember.userId, userId))
    .orderBy(desc(organizationMember.joinedAt));

  return rows;
}

/**
 * List members of an organization with user details.
 */
export async function getOrganizationMembers(
  orgId: string,
): Promise<
  Array<{
    memberId: string;
    userId: string;
    name: string;
    email: string;
    image: string | null;
    role: OrganizationMember["role"];
    joinedAt: Date;
  }>
> {
  const rows = await db
    .select({
      memberId: organizationMember.id,
      userId: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      role: organizationMember.role,
      joinedAt: organizationMember.joinedAt,
    })
    .from(organizationMember)
    .innerJoin(user, eq(organizationMember.userId, user.id))
    .where(eq(organizationMember.organizationId, orgId))
    .orderBy(desc(organizationMember.joinedAt));

  return rows;
}

/**
 * Add a member to an organization.
 */
export async function addOrganizationMember(
  orgId: string,
  userId: string,
  role: OrganizationMember["role"] = "member",
): Promise<OrganizationMember> {
  const [member] = await db
    .insert(organizationMember)
    .values({
      organizationId: orgId,
      userId,
      role,
    })
    .returning();

  return member;
}

/**
 * Remove a member from an organization.
 */
export async function removeOrganizationMember(
  orgId: string,
  userId: string,
): Promise<void> {
  await db
    .delete(organizationMember)
    .where(
      and(
        eq(organizationMember.organizationId, orgId),
        eq(organizationMember.userId, userId),
      ),
    );
}

/**
 * Ensure a user has at least one personal organization.
 * If they already have one, return the first. Otherwise, create one
 * derived from their display name.
 */
export async function ensurePersonalOrg(
  userId: string,
  userName: string,
): Promise<Organization> {
  const orgs = await getUserOrganizations(userId);
  if (orgs.length > 0) return orgs[0];

  const slug =
    userName
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 32) || `user-${userId.slice(0, 8)}`;

  return createOrganization(`${userName}'s Workspace`, slug, userId);
}

/**
 * Update an organization's plan and optional Stripe identifiers.
 */
export async function updateOrganizationPlan(
  orgId: string,
  plan: Organization["plan"],
  stripeCustomerId?: string,
  stripeSubscriptionId?: string,
): Promise<Organization> {
  const [updated] = await db
    .update(organization)
    .set({
      plan,
      ...(stripeCustomerId !== undefined && { stripeCustomerId }),
      ...(stripeSubscriptionId !== undefined && { stripeSubscriptionId }),
    })
    .where(eq(organization.id, orgId))
    .returning();

  return updated;
}
