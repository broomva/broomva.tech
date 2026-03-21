import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { getSafeSession } from "@/lib/auth";
import { logAudit } from "@/lib/db/audit";
import {
  createEscrow,
  disputeEscrow,
  getEscrowById,
  getMarketplaceTaskById,
  refundEscrow,
  releaseEscrow,
} from "@/lib/db/marketplace";
import { getUserOrganizations } from "@/lib/db/organization";
import { agentRegistration } from "@/lib/db/schema";
import { db } from "@/lib/db/client";
import { eq } from "drizzle-orm";

/**
 * POST /api/marketplace/escrow — create an escrow (buyer initiates).
 *
 * Body: {
 *   taskId: string,
 *   buyerOrgId: string
 * }
 *
 * Deducts priceCredits from the buyer org's planCreditsRemaining and
 * creates a held escrow record. The seller org is resolved from the
 * task's agent registration.
 */
export async function POST(request: Request) {
  const { data: session } = await getSafeSession({
    fetchOptions: { headers: await headers() },
  });

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: { taskId: string; buyerOrgId: string };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { taskId, buyerOrgId } = body;

  if (!taskId || !buyerOrgId) {
    return NextResponse.json(
      { error: "Missing required fields: taskId, buyerOrgId" },
      { status: 400 },
    );
  }

  // Verify buyer org membership
  const userOrgs = await getUserOrganizations(session.user.id);
  const isBuyerMember = userOrgs.some((org) => org.id === buyerOrgId);

  if (!isBuyerMember) {
    return NextResponse.json(
      { error: "You are not a member of the buyer organization" },
      { status: 403 },
    );
  }

  // Resolve the task and seller org
  const task = await getMarketplaceTaskById(taskId);

  if (!task) {
    return NextResponse.json(
      { error: "Marketplace task not found" },
      { status: 404 },
    );
  }

  if (task.status !== "active") {
    return NextResponse.json(
      { error: "Task is not active" },
      { status: 400 },
    );
  }

  // Look up the agent's organization to determine the seller
  const [agent] = await db
    .select({ organizationId: agentRegistration.organizationId })
    .from(agentRegistration)
    .where(eq(agentRegistration.id, task.agentId))
    .limit(1);

  if (!agent?.organizationId) {
    return NextResponse.json(
      { error: "Task agent has no associated organization" },
      { status: 400 },
    );
  }

  const sellerOrgId = agent.organizationId;

  // Prevent buying from yourself
  if (buyerOrgId === sellerOrgId) {
    return NextResponse.json(
      { error: "Cannot create escrow with yourself" },
      { status: 400 },
    );
  }

  try {
    const escrow = await createEscrow({
      taskId,
      buyerOrgId,
      sellerOrgId,
      amountCredits: task.priceCredits,
    });

    logAudit({
      organizationId: buyerOrgId,
      actorId: session.user.id,
      action: "marketplace.escrow.created",
      resourceType: "escrow_transaction",
      resourceId: escrow.id,
      metadata: {
        taskId,
        buyerOrgId,
        sellerOrgId,
        amountCredits: task.priceCredits,
        commissionCredits: escrow.commissionCredits,
      },
    });

    return NextResponse.json({ escrow }, { status: 201 });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to create escrow";

    if (message === "Insufficient credits") {
      return NextResponse.json({ error: message }, { status: 402 });
    }

    console.error("[marketplace/escrow] Failed to create escrow:", err);
    return NextResponse.json(
      { error: "Failed to create escrow" },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/marketplace/escrow — release, refund, or dispute an escrow.
 *
 * Body: {
 *   escrowId: string,
 *   action: "release" | "refund" | "dispute",
 *   reason?: string  // required for "dispute"
 * }
 *
 * Authorization:
 *   - release: seller org member
 *   - refund:  seller org member (voluntary) or buyer org member
 *   - dispute: buyer org member or seller org member
 */
export async function PATCH(request: Request) {
  const { data: session } = await getSafeSession({
    fetchOptions: { headers: await headers() },
  });

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: { escrowId: string; action: string; reason?: string };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { escrowId, action, reason } = body;

  if (!escrowId || !action) {
    return NextResponse.json(
      { error: "Missing required fields: escrowId, action" },
      { status: 400 },
    );
  }

  const validActions = ["release", "refund", "dispute"] as const;
  if (!validActions.includes(action as (typeof validActions)[number])) {
    return NextResponse.json(
      { error: `Invalid action. Must be one of: ${validActions.join(", ")}` },
      { status: 400 },
    );
  }

  if (action === "dispute" && !reason) {
    return NextResponse.json(
      { error: "reason is required for dispute action" },
      { status: 400 },
    );
  }

  // Verify the escrow exists and caller has access
  const escrow = await getEscrowById(escrowId);

  if (!escrow) {
    return NextResponse.json(
      { error: "Escrow not found" },
      { status: 404 },
    );
  }

  if (escrow.status !== "held") {
    return NextResponse.json(
      { error: `Escrow is already ${escrow.status}` },
      { status: 400 },
    );
  }

  const userOrgs = await getUserOrganizations(session.user.id);
  const userOrgIds = new Set(userOrgs.map((o) => o.id));

  const isBuyer = userOrgIds.has(escrow.buyerOrgId);
  const isSeller = userOrgIds.has(escrow.sellerOrgId);

  // Authorization per action
  if (action === "release" && !isSeller) {
    return NextResponse.json(
      { error: "Only the seller organization can release escrow" },
      { status: 403 },
    );
  }

  if (action === "refund" && !isBuyer && !isSeller) {
    return NextResponse.json(
      { error: "Only buyer or seller organization can refund escrow" },
      { status: 403 },
    );
  }

  if (action === "dispute" && !isBuyer && !isSeller) {
    return NextResponse.json(
      { error: "Only buyer or seller organization can dispute escrow" },
      { status: 403 },
    );
  }

  try {
    let result: typeof escrow;

    switch (action) {
      case "release":
        result = await releaseEscrow(escrowId);
        break;
      case "refund":
        result = await refundEscrow(escrowId);
        break;
      case "dispute":
        result = await disputeEscrow(escrowId, reason!);
        break;
      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    logAudit({
      organizationId: isBuyer ? escrow.buyerOrgId : escrow.sellerOrgId,
      actorId: session.user.id,
      action: `marketplace.escrow.${action}`,
      resourceType: "escrow_transaction",
      resourceId: escrowId,
      metadata: {
        taskId: escrow.taskId,
        amountCredits: escrow.amountCredits,
        ...(reason && { reason }),
      },
    });

    return NextResponse.json({ escrow: result });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : `Failed to ${action} escrow`;
    console.error(`[marketplace/escrow] Failed to ${action} escrow:`, err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
