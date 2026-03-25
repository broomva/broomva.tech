/**
 * /api/tenant/mcp-servers — BRO-226 / BRO-228
 *
 * Enterprise admins register private MCP servers for their org.
 * URL and bearer token are encrypted at rest via encryptedText columns.
 *
 * GET  ?organizationId=<id>                             → list servers
 * POST { organizationId, name, url, bearerToken?, assignedRoles? } → create/update
 * PATCH { organizationId, serverId, enabled }           → toggle
 * DELETE { organizationId, serverId }                   → remove
 */

import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getSafeSession } from "@/lib/auth";
import { getOrganizationMembers } from "@/lib/db/organization";
import { db } from "@/lib/db/client";
import { organization, organizationMcpServer } from "@/lib/db/schema";

async function requireAdmin(orgId: string, userId: string): Promise<boolean> {
  const members = await getOrganizationMembers(orgId);
  const actor = members.find((m) => m.userId === userId);
  return actor?.role === "owner" || actor?.role === "admin";
}

async function requireEnterprise(orgId: string): Promise<boolean> {
  const [org] = await db
    .select({ plan: organization.plan })
    .from(organization)
    .where(eq(organization.id, orgId))
    .limit(1);
  return org?.plan === "enterprise";
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

  const servers = await db
    .select({
      id: organizationMcpServer.id,
      name: organizationMcpServer.name,
      // url and bearerToken intentionally omitted from list response
      assignedRoles: organizationMcpServer.assignedRoles,
      enabled: organizationMcpServer.enabled,
      createdAt: organizationMcpServer.createdAt,
      updatedAt: organizationMcpServer.updatedAt,
    })
    .from(organizationMcpServer)
    .where(eq(organizationMcpServer.organizationId, orgId));

  return NextResponse.json({ servers });
}

export async function POST(request: NextRequest) {
  const { data: session } = await getSafeSession({
    fetchOptions: { headers: await headers() },
  });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { organizationId, name, url, bearerToken, assignedRoles } =
    await request.json();

  if (!organizationId || !name || !url) {
    return NextResponse.json(
      { error: "organizationId, name, and url are required" },
      { status: 400 }
    );
  }

  if (!(await requireAdmin(organizationId, session.user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!(await requireEnterprise(organizationId))) {
    return NextResponse.json(
      { error: "Custom MCP servers require Enterprise plan" },
      { status: 403 }
    );
  }

  const [row] = await db
    .insert(organizationMcpServer)
    .values({
      organizationId,
      name,
      url,
      bearerToken: bearerToken ?? null,
      assignedRoles: assignedRoles ?? [],
    })
    .onConflictDoUpdate({
      target: [organizationMcpServer.organizationId, organizationMcpServer.name],
      set: {
        url,
        bearerToken: bearerToken ?? null,
        assignedRoles: assignedRoles ?? [],
        updatedAt: new Date(),
      },
    })
    .returning({
      id: organizationMcpServer.id,
      name: organizationMcpServer.name,
      assignedRoles: organizationMcpServer.assignedRoles,
      enabled: organizationMcpServer.enabled,
      createdAt: organizationMcpServer.createdAt,
    });

  return NextResponse.json({ server: row });
}

export async function PATCH(request: NextRequest) {
  const { data: session } = await getSafeSession({
    fetchOptions: { headers: await headers() },
  });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { organizationId, serverId, enabled } = await request.json();
  if (!organizationId || !serverId || enabled === undefined) {
    return NextResponse.json(
      { error: "organizationId, serverId, and enabled are required" },
      { status: 400 }
    );
  }

  if (!(await requireAdmin(organizationId, session.user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [row] = await db
    .update(organizationMcpServer)
    .set({ enabled, updatedAt: new Date() })
    .where(
      and(
        eq(organizationMcpServer.id, serverId),
        eq(organizationMcpServer.organizationId, organizationId),
      )
    )
    .returning({
      id: organizationMcpServer.id,
      name: organizationMcpServer.name,
      enabled: organizationMcpServer.enabled,
    });

  if (!row) {
    return NextResponse.json({ error: "Server not found" }, { status: 404 });
  }

  return NextResponse.json({ server: row });
}

export async function DELETE(request: NextRequest) {
  const { data: session } = await getSafeSession({
    fetchOptions: { headers: await headers() },
  });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { organizationId, serverId } = await request.json();
  if (!organizationId || !serverId) {
    return NextResponse.json(
      { error: "organizationId and serverId are required" },
      { status: 400 }
    );
  }

  if (!(await requireAdmin(organizationId, session.user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await db
    .delete(organizationMcpServer)
    .where(
      and(
        eq(organizationMcpServer.id, serverId),
        eq(organizationMcpServer.organizationId, organizationId),
      )
    );

  return NextResponse.json({ deleted: true });
}
