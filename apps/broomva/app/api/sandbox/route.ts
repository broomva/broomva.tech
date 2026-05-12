/**
 * GET /api/sandbox — list sandboxes for the authenticated user's organization
 *
 * Reads from the local SandboxInstance table (populated by arcand webhooks
 * and direct API calls). Returns org-scoped results only.
 *
 * Part of BRO-261: Sandbox management API + console UI
 */

import { NextResponse } from "next/server";

import { withAuth } from "@/lib/api/with-auth";
import { getUserOrganizations } from "@/lib/db/organization";
import { getOrgSandboxes, getSandboxMetrics } from "@/lib/db/sandbox-queries";

export const GET = withAuth(async (_request, { userId }) => {
  try {
    const orgs = await getUserOrganizations(userId);
    const org = orgs[0];
    if (!org) {
      return NextResponse.json({ sandboxes: [], metrics: { active: 0, snapshotted: 0, execs24h: 0 } });
    }

    const [sandboxes, metrics] = await Promise.all([
      getOrgSandboxes(org.id),
      getSandboxMetrics(org.id),
    ]);

    return NextResponse.json({ sandboxes, metrics });
  } catch (err) {
    console.error("[sandbox] Failed to list sandboxes:", err);
    return NextResponse.json(
      { error: "Failed to list sandboxes" },
      { status: 500 },
    );
  }
});
