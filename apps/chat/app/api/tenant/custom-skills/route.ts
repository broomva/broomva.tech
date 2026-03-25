/**
 * /api/tenant/custom-skills — BRO-228
 *
 * Enterprise admins upload and manage custom SKILL.md manifests (TOML).
 *
 * GET  ?organizationId=<id>                       → list skills
 * POST { organizationId, name, manifestToml, assignedRoles?, enabled? } → create/update
 * DELETE { organizationId, skillId }              → remove
 * PATCH { organizationId, skillId, enabled }      → toggle active state
 */

import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getSafeSession } from "@/lib/auth";
import { getOrganizationMembers } from "@/lib/db/organization";
import { db } from "@/lib/db/client";
import { organizationCustomSkill } from "@/lib/db/schema";

async function requireAdmin(orgId: string, userId: string): Promise<boolean> {
  const members = await getOrganizationMembers(orgId);
  const actor = members.find((m) => m.userId === userId);
  return actor?.role === "owner" || actor?.role === "admin";
}

export async function GET(request: NextRequest) {
  const { data: session } = await getSafeSession({
    fetchOptions: { headers: await headers() },
  });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orgId = request.nextUrl.searchParams.get("organizationId");
  if (!orgId) {
    return NextResponse.json({ error: "organizationId required" }, { status: 400 });
  }

  if (!(await requireAdmin(orgId, session.user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const skills = await db
    .select()
    .from(organizationCustomSkill)
    .where(eq(organizationCustomSkill.organizationId, orgId));

  return NextResponse.json({ skills });
}

export async function POST(request: NextRequest) {
  const { data: session } = await getSafeSession({
    fetchOptions: { headers: await headers() },
  });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { organizationId, name, manifestToml, assignedRoles, enabled } =
    await request.json();

  if (!organizationId || !name || !manifestToml) {
    return NextResponse.json(
      { error: "organizationId, name, and manifestToml are required" },
      { status: 400 }
    );
  }

  if (!(await requireAdmin(organizationId, session.user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [row] = await db
    .insert(organizationCustomSkill)
    .values({
      organizationId,
      name,
      manifestToml,
      assignedRoles: assignedRoles ?? [],
      enabled: enabled ?? true,
    })
    .onConflictDoUpdate({
      target: [organizationCustomSkill.organizationId, organizationCustomSkill.name],
      set: {
        manifestToml,
        assignedRoles: assignedRoles ?? [],
        enabled: enabled ?? true,
        updatedAt: new Date(),
      },
    })
    .returning();

  return NextResponse.json({ skill: row });
}

export async function PATCH(request: NextRequest) {
  const { data: session } = await getSafeSession({
    fetchOptions: { headers: await headers() },
  });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { organizationId, skillId, enabled } = await request.json();
  if (!organizationId || !skillId || enabled === undefined) {
    return NextResponse.json(
      { error: "organizationId, skillId, and enabled are required" },
      { status: 400 }
    );
  }

  if (!(await requireAdmin(organizationId, session.user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [row] = await db
    .update(organizationCustomSkill)
    .set({ enabled, updatedAt: new Date() })
    .where(
      and(
        eq(organizationCustomSkill.id, skillId),
        eq(organizationCustomSkill.organizationId, organizationId),
      )
    )
    .returning();

  if (!row) {
    return NextResponse.json({ error: "Skill not found" }, { status: 404 });
  }

  return NextResponse.json({ skill: row });
}

export async function DELETE(request: NextRequest) {
  const { data: session } = await getSafeSession({
    fetchOptions: { headers: await headers() },
  });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { organizationId, skillId } = await request.json();
  if (!organizationId || !skillId) {
    return NextResponse.json(
      { error: "organizationId and skillId are required" },
      { status: 400 }
    );
  }

  if (!(await requireAdmin(organizationId, session.user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await db
    .delete(organizationCustomSkill)
    .where(
      and(
        eq(organizationCustomSkill.id, skillId),
        eq(organizationCustomSkill.organizationId, organizationId),
      )
    );

  return NextResponse.json({ deleted: true });
}
