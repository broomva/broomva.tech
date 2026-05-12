/**
 * /api/tenant/arcan-roles — BRO-228
 *
 * Enterprise admins configure per-role Arcan capability overrides.
 *
 * GET  ?organizationId=<id>                    → list roles
 * POST { organizationId, roleName, allowCapabilities, maxEventsPerTurn } → upsert
 * DELETE { organizationId, roleName }           → remove
 */

import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getSafeSession } from "@/lib/auth";
import { getOrganizationMembers } from "@/lib/db/organization";
import { db } from "@/lib/db/client";
import { organizationArcanRole } from "@/lib/db/schema";

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

  const roles = await db
    .select()
    .from(organizationArcanRole)
    .where(eq(organizationArcanRole.organizationId, orgId));

  return NextResponse.json({ roles });
}

export async function POST(request: NextRequest) {
  const { data: session } = await getSafeSession({
    fetchOptions: { headers: await headers() },
  });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const {
    organizationId,
    roleName,
    allowCapabilities,
    maxEventsPerTurn,
  } = await request.json();

  if (!organizationId || !roleName) {
    return NextResponse.json(
      { error: "organizationId and roleName are required" },
      { status: 400 }
    );
  }

  if (!(await requireAdmin(organizationId, session.user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [row] = await db
    .insert(organizationArcanRole)
    .values({
      organizationId,
      roleName,
      allowCapabilities: allowCapabilities ?? [],
      maxEventsPerTurn: maxEventsPerTurn ?? 20,
    })
    .onConflictDoUpdate({
      target: [organizationArcanRole.organizationId, organizationArcanRole.roleName],
      set: {
        allowCapabilities: allowCapabilities ?? [],
        maxEventsPerTurn: maxEventsPerTurn ?? 20,
        updatedAt: new Date(),
      },
    })
    .returning();

  return NextResponse.json({ role: row });
}

export async function DELETE(request: NextRequest) {
  const { data: session } = await getSafeSession({
    fetchOptions: { headers: await headers() },
  });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { organizationId, roleName } = await request.json();
  if (!organizationId || !roleName) {
    return NextResponse.json(
      { error: "organizationId and roleName are required" },
      { status: 400 }
    );
  }

  if (!(await requireAdmin(organizationId, session.user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await db
    .delete(organizationArcanRole)
    .where(
      and(
        eq(organizationArcanRole.organizationId, organizationId),
        eq(organizationArcanRole.roleName, roleName),
      )
    );

  return NextResponse.json({ deleted: true });
}
