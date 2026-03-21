import { headers } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getSafeSession } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { logAudit } from "@/lib/db/audit";
import {
  organization,
  organizationLifeInstance,
  organizationMember,
} from "@/lib/db/schema";
import {
  deleteLifeInstance,
  getLifeInstanceStatus,
  isRailwayConfigured,
  provisionLifeInstance,
} from "@/lib/railway";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the authenticated user and verify they have admin/owner access
 * to the given organization.
 *
 * Returns `{ userId, role }` on success or a NextResponse error.
 */
async function requireOrgAdmin(organizationId: string): Promise<
  | { userId: string; role: string }
  | NextResponse
> {
  const { data: session } = await getSafeSession({
    fetchOptions: { headers: await headers() },
  });

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  const [membership] = await db
    .select({
      role: organizationMember.role,
    })
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
      { error: "Not a member of this organization" },
      { status: 403 },
    );
  }

  if (membership.role !== "owner" && membership.role !== "admin") {
    return NextResponse.json(
      { error: "Admin or owner role required" },
      { status: 403 },
    );
  }

  return { userId, role: membership.role };
}

// ---------------------------------------------------------------------------
// POST — Provision a new Life instance for an organization
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  let body: { organizationId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const { organizationId: orgId } = body;

  if (!orgId) {
    return NextResponse.json(
      { error: "organizationId is required" },
      { status: 400 },
    );
  }

  // Auth: require admin/owner
  const authResult = await requireOrgAdmin(orgId);
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  // Validate the organization exists and is on the enterprise plan
  const [org] = await db
    .select({
      id: organization.id,
      slug: organization.slug,
      plan: organization.plan,
    })
    .from(organization)
    .where(eq(organization.id, orgId))
    .limit(1);

  if (!org) {
    return NextResponse.json(
      { error: "Organization not found" },
      { status: 404 },
    );
  }

  if (org.plan !== "enterprise") {
    return NextResponse.json(
      {
        error: "Life instances are only available on the enterprise plan",
        currentPlan: org.plan,
      },
      { status: 403 },
    );
  }

  // Check if an instance already exists for this org
  const [existing] = await db
    .select({ id: organizationLifeInstance.id, status: organizationLifeInstance.status })
    .from(organizationLifeInstance)
    .where(eq(organizationLifeInstance.organizationId, orgId))
    .limit(1);

  if (existing && existing.status !== "failed") {
    return NextResponse.json(
      {
        error: "A Life instance already exists for this organization",
        instanceId: existing.id,
        status: existing.status,
      },
      { status: 409 },
    );
  }

  // Check Railway availability
  if (!isRailwayConfigured()) {
    return NextResponse.json(
      { error: "Railway API is not configured. Set RAILWAY_API_TOKEN." },
      { status: 503 },
    );
  }

  // Create the DB record in "provisioning" state
  const [instance] = await db
    .insert(organizationLifeInstance)
    .values({
      organizationId: orgId,
      status: "provisioning",
    })
    .returning();

  logAudit({
    organizationId: orgId,
    actorId: userId,
    action: "life_instance.provision.start",
    resourceType: "life_instance",
    resourceId: instance.id,
  });

  try {
    const result = await provisionLifeInstance(org.slug, orgId);

    // Update the record with Railway details
    const [updated] = await db
      .update(organizationLifeInstance)
      .set({
        railwayProjectId: result.railwayProjectId,
        railwayEnvironmentId: result.railwayEnvironmentId,
        arcanUrl: result.services.arcan.url,
        lagoUrl: result.services.lago.url,
        autonomicUrl: result.services.autonomic.url,
        haimaUrl: result.services.haima.url,
        status: "running",
        lastHealthCheck: new Date(),
      })
      .where(eq(organizationLifeInstance.id, instance.id))
      .returning();

    logAudit({
      organizationId: orgId,
      actorId: userId,
      action: "life_instance.provision.complete",
      resourceType: "life_instance",
      resourceId: instance.id,
      metadata: {
        railwayProjectId: result.railwayProjectId,
        services: {
          arcan: result.services.arcan.url,
          lago: result.services.lago.url,
          autonomic: result.services.autonomic.url,
          haima: result.services.haima.url,
        },
      },
    });

    return NextResponse.json(
      {
        instance: updated,
      },
      { status: 201 },
    );
  } catch (err) {
    // Mark the instance as failed
    await db
      .update(organizationLifeInstance)
      .set({ status: "failed" })
      .where(eq(organizationLifeInstance.id, instance.id));

    logAudit({
      organizationId: orgId,
      actorId: userId,
      action: "life_instance.provision.failed",
      resourceType: "life_instance",
      resourceId: instance.id,
      metadata: {
        error: err instanceof Error ? err.message : String(err),
      },
    });

    console.error("[platform/life] Provisioning failed:", err);

    return NextResponse.json(
      {
        error: "Failed to provision Life instance",
        detail: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// GET — Get Life instance status for an organization
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const { data: session } = await getSafeSession({
    fetchOptions: { headers: await headers() },
  });

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const orgId = searchParams.get("organizationId");

  if (!orgId) {
    return NextResponse.json(
      { error: "organizationId query parameter is required" },
      { status: 400 },
    );
  }

  // Verify the user is a member of this organization
  const [membership] = await db
    .select({ role: organizationMember.role })
    .from(organizationMember)
    .where(
      and(
        eq(organizationMember.organizationId, orgId),
        eq(organizationMember.userId, session.user.id),
      ),
    )
    .limit(1);

  if (!membership) {
    return NextResponse.json(
      { error: "Not a member of this organization" },
      { status: 403 },
    );
  }

  // Fetch the Life instance record
  const [instance] = await db
    .select()
    .from(organizationLifeInstance)
    .where(eq(organizationLifeInstance.organizationId, orgId))
    .limit(1);

  if (!instance) {
    return NextResponse.json(
      { error: "No Life instance found for this organization" },
      { status: 404 },
    );
  }

  // If Railway is configured and the instance has a project ID, fetch live status
  let railwayStatus = null;
  if (isRailwayConfigured() && instance.railwayProjectId) {
    try {
      railwayStatus = await getLifeInstanceStatus(instance.railwayProjectId);
    } catch (err) {
      console.warn("[platform/life] Failed to fetch Railway status:", err);
      // Non-fatal — return DB record without live status
    }
  }

  return NextResponse.json({
    instance,
    railwayStatus,
  });
}

// ---------------------------------------------------------------------------
// DELETE — Deprovision a Life instance
// ---------------------------------------------------------------------------

export async function DELETE(request: NextRequest) {
  let body: { organizationId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const { organizationId: orgId } = body;

  if (!orgId) {
    return NextResponse.json(
      { error: "organizationId is required" },
      { status: 400 },
    );
  }

  // Auth: require admin/owner
  const authResult = await requireOrgAdmin(orgId);
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  // Find the existing instance
  const [instance] = await db
    .select()
    .from(organizationLifeInstance)
    .where(eq(organizationLifeInstance.organizationId, orgId))
    .limit(1);

  if (!instance) {
    return NextResponse.json(
      { error: "No Life instance found for this organization" },
      { status: 404 },
    );
  }

  if (instance.status === "deprovisioning") {
    return NextResponse.json(
      { error: "Instance is already being deprovisioned" },
      { status: 409 },
    );
  }

  // Mark as deprovisioning immediately
  await db
    .update(organizationLifeInstance)
    .set({ status: "deprovisioning" })
    .where(eq(organizationLifeInstance.id, instance.id));

  logAudit({
    organizationId: orgId,
    actorId: userId,
    action: "life_instance.deprovision.start",
    resourceType: "life_instance",
    resourceId: instance.id,
  });

  // Attempt to delete the Railway project
  if (instance.railwayProjectId && isRailwayConfigured()) {
    try {
      await deleteLifeInstance(instance.railwayProjectId);

      logAudit({
        organizationId: orgId,
        actorId: userId,
        action: "life_instance.deprovision.complete",
        resourceType: "life_instance",
        resourceId: instance.id,
        metadata: { railwayProjectId: instance.railwayProjectId },
      });
    } catch (err) {
      console.error("[platform/life] Railway deletion failed:", err);

      logAudit({
        organizationId: orgId,
        actorId: userId,
        action: "life_instance.deprovision.failed",
        resourceType: "life_instance",
        resourceId: instance.id,
        metadata: {
          error: err instanceof Error ? err.message : String(err),
          railwayProjectId: instance.railwayProjectId,
        },
      });

      // Mark as failed instead of deprovisioning so it can be retried
      await db
        .update(organizationLifeInstance)
        .set({ status: "failed" })
        .where(eq(organizationLifeInstance.id, instance.id));

      return NextResponse.json(
        {
          error: "Failed to delete Railway project",
          detail: err instanceof Error ? err.message : "Unknown error",
        },
        { status: 500 },
      );
    }
  }

  // Remove the DB record after successful Railway deletion
  await db
    .delete(organizationLifeInstance)
    .where(eq(organizationLifeInstance.id, instance.id));

  return NextResponse.json({
    message: "Life instance deprovisioned successfully",
    instanceId: instance.id,
  });
}
