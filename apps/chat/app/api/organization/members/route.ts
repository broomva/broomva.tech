import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { getSafeSession } from "@/lib/auth";
import {
  addOrganizationMember,
  getOrganizationMembers,
  removeOrganizationMember,
} from "@/lib/db/organization";
import { logAudit } from "@/lib/db/audit";
import { db } from "@/lib/db/client";
import { user, organizationMember } from "@/lib/db/schema";

/**
 * Verify that the acting user is an owner or admin of the given organization.
 */
async function isAdminOrOwner(
  orgId: string,
  userId: string,
): Promise<boolean> {
  const members = await getOrganizationMembers(orgId);
  const actor = members.find((m) => m.userId === userId);
  return actor?.role === "owner" || actor?.role === "admin";
}

/**
 * GET /api/organization/members?organizationId=xxx — list members with user details
 */
export async function GET(request: Request) {
  const { data: session } = await getSafeSession({
    fetchOptions: { headers: await headers() },
  });

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const organizationId = searchParams.get("organizationId");

  if (!organizationId) {
    return NextResponse.json(
      { error: "Missing required query parameter: organizationId" },
      { status: 400 },
    );
  }

  try {
    const members = await getOrganizationMembers(organizationId);

    // Only return members if the requesting user is themselves a member
    const isMember = members.some((m) => m.userId === session.user!.id);
    if (!isMember) {
      return NextResponse.json(
        { error: "Not a member of this organization" },
        { status: 403 },
      );
    }

    return NextResponse.json({ members });
  } catch (err) {
    console.error("[organization/members] Failed to fetch members:", err);
    return NextResponse.json(
      { error: "Failed to fetch members" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/organization/members — invite/add a member by email
 * Body: { organizationId: string, email: string, role: "admin" | "member" | "viewer" }
 */
export async function POST(request: Request) {
  const { data: session } = await getSafeSession({
    fetchOptions: { headers: await headers() },
  });

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: { organizationId: string; email: string; role: string };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { organizationId, email, role } = body;

  if (!organizationId || !email || !role) {
    return NextResponse.json(
      { error: "Missing required fields: organizationId, email, role" },
      { status: 400 },
    );
  }

  if (!["admin", "member", "viewer"].includes(role)) {
    return NextResponse.json(
      { error: 'Role must be "admin", "member", or "viewer"' },
      { status: 400 },
    );
  }

  // Verify actor is admin or owner
  if (!(await isAdminOrOwner(organizationId, session.user.id))) {
    return NextResponse.json(
      { error: "Only admins and owners can add members" },
      { status: 403 },
    );
  }

  try {
    // Look up the user by email
    const [targetUser] = await db
      .select()
      .from(user)
      .where(eq(user.email, email.toLowerCase().trim()))
      .limit(1);

    if (!targetUser) {
      return NextResponse.json(
        { error: "No user found with that email address" },
        { status: 404 },
      );
    }

    // Check if already a member
    const existingMembers = await getOrganizationMembers(organizationId);
    if (existingMembers.some((m) => m.userId === targetUser.id)) {
      return NextResponse.json(
        { error: "User is already a member of this organization" },
        { status: 409 },
      );
    }

    const member = await addOrganizationMember(
      organizationId,
      targetUser.id,
      role as "admin" | "member" | "viewer",
    );

    logAudit({
      organizationId,
      actorId: session.user.id,
      action: "organization.member_added",
      resourceType: "organizationMember",
      resourceId: member.id,
      metadata: { email, role, targetUserId: targetUser.id },
    });

    return NextResponse.json({ member }, { status: 201 });
  } catch (err) {
    console.error("[organization/members] Failed to add member:", err);
    return NextResponse.json(
      { error: "Failed to add member" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/organization/members — remove a member
 * Body: { organizationId: string, userId: string }
 */
export async function DELETE(request: Request) {
  const { data: session } = await getSafeSession({
    fetchOptions: { headers: await headers() },
  });

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: { organizationId: string; userId: string };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { organizationId, userId } = body;

  if (!organizationId || !userId) {
    return NextResponse.json(
      { error: "Missing required fields: organizationId, userId" },
      { status: 400 },
    );
  }

  // Verify actor is admin or owner
  if (!(await isAdminOrOwner(organizationId, session.user.id))) {
    return NextResponse.json(
      { error: "Only admins and owners can remove members" },
      { status: 403 },
    );
  }

  try {
    // Prevent removing the last owner
    const members = await getOrganizationMembers(organizationId);
    const targetMember = members.find((m) => m.userId === userId);

    if (!targetMember) {
      return NextResponse.json(
        { error: "User is not a member of this organization" },
        { status: 404 },
      );
    }

    if (targetMember.role === "owner") {
      const ownerCount = members.filter((m) => m.role === "owner").length;
      if (ownerCount <= 1) {
        return NextResponse.json(
          { error: "Cannot remove the last owner of an organization" },
          { status: 400 },
        );
      }
    }

    await removeOrganizationMember(organizationId, userId);

    logAudit({
      organizationId,
      actorId: session.user.id,
      action: "organization.member_removed",
      resourceType: "organizationMember",
      resourceId: targetMember.memberId,
      metadata: { removedUserId: userId, removedRole: targetMember.role },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[organization/members] Failed to remove member:", err);
    return NextResponse.json(
      { error: "Failed to remove member" },
      { status: 500 },
    );
  }
}
