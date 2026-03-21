import { headers } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";

import { getSafeSession } from "@/lib/auth";
import { logAudit } from "@/lib/db/audit";
import {
  agentBelongsToOrg,
  createMarketplaceTask,
  listMarketplaceTasks,
} from "@/lib/db/marketplace";
import { getUserOrganizations } from "@/lib/db/organization";

/**
 * GET /api/marketplace/tasks — list active marketplace task listings.
 *
 * Query params:
 *   capability — filter by agent capability (e.g. "code-review")
 *   max_price — maximum price in credits (cents)
 *   limit     — number of results (default 20, max 100)
 *
 * Public endpoint (no auth required for browsing).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const capability = searchParams.get("capability") ?? undefined;
  const maxPriceRaw = searchParams.get("max_price");
  const limitRaw = searchParams.get("limit");

  const maxPrice =
    maxPriceRaw != null ? Number.parseInt(maxPriceRaw, 10) : undefined;
  const limit = limitRaw != null ? Number.parseInt(limitRaw, 10) : 20;

  if (maxPrice != null && (Number.isNaN(maxPrice) || maxPrice < 0)) {
    return NextResponse.json(
      { error: "max_price must be a non-negative integer" },
      { status: 400 },
    );
  }

  if (Number.isNaN(limit) || limit < 1) {
    return NextResponse.json(
      { error: "limit must be a positive integer" },
      { status: 400 },
    );
  }

  try {
    const tasks = await listMarketplaceTasks({ capability, maxPrice, limit });
    return NextResponse.json({ tasks });
  } catch (err) {
    console.error("[marketplace/tasks] Failed to list tasks:", err);
    return NextResponse.json(
      { error: "Failed to list marketplace tasks" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/marketplace/tasks — create a new task listing.
 *
 * Body: {
 *   agentId: string,
 *   title: string,
 *   description?: string,
 *   priceCredits: number,
 *   currency?: string,          // default "USD"
 *   estimatedDurationMs?: number
 * }
 *
 * Authenticated — the caller must own the agent (agent's org must be one
 * of the caller's organizations).
 */
export async function POST(request: Request) {
  const { data: session } = await getSafeSession({
    fetchOptions: { headers: await headers() },
  });

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: {
    agentId: string;
    title: string;
    description?: string;
    priceCredits: number;
    currency?: string;
    estimatedDurationMs?: number;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { agentId, title, priceCredits } = body;

  if (!agentId || !title || priceCredits == null) {
    return NextResponse.json(
      { error: "Missing required fields: agentId, title, priceCredits" },
      { status: 400 },
    );
  }

  if (typeof priceCredits !== "number" || priceCredits <= 0) {
    return NextResponse.json(
      { error: "priceCredits must be a positive number" },
      { status: 400 },
    );
  }

  // Verify caller owns the agent via org membership
  const userOrgs = await getUserOrganizations(session.user.id);
  const ownsAgent = await Promise.all(
    userOrgs.map((org) => agentBelongsToOrg(agentId, org.id)),
  );

  if (!ownsAgent.some(Boolean)) {
    return NextResponse.json(
      { error: "You do not have access to this agent" },
      { status: 403 },
    );
  }

  try {
    const task = await createMarketplaceTask({
      agentId,
      title: title.trim(),
      description: body.description?.trim(),
      priceCredits,
      currency: body.currency,
      estimatedDurationMs: body.estimatedDurationMs,
    });

    logAudit({
      actorId: session.user.id,
      action: "marketplace.task.created",
      resourceType: "marketplace_task",
      resourceId: task.id,
      metadata: { agentId, title: task.title, priceCredits },
    });

    return NextResponse.json({ task }, { status: 201 });
  } catch (err) {
    console.error("[marketplace/tasks] Failed to create task:", err);
    return NextResponse.json(
      { error: "Failed to create marketplace task" },
      { status: 500 },
    );
  }
}
