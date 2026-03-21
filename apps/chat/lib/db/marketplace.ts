import "server-only";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "./client";
import {
  agentRegistration,
  escrowTransaction,
  marketplaceTask,
  organization,
  type EscrowTransaction,
  type MarketplaceTask,
} from "./schema";

// ---------------------------------------------------------------------------
// Marketplace Task Queries
// ---------------------------------------------------------------------------

/** Platform commission rate: 5% */
const COMMISSION_RATE = 0.05;

/**
 * List active marketplace tasks with optional filters.
 */
export async function listMarketplaceTasks(filters: {
  capability?: string;
  maxPrice?: number;
  limit?: number;
}): Promise<
  Array<
    MarketplaceTask & {
      agentName: string;
      agentTrustLevel: string;
      organizationId: string | null;
    }
  >
> {
  const limit = Math.min(filters.limit ?? 20, 100);

  const conditions = [eq(marketplaceTask.status, "active")];

  if (filters.maxPrice != null) {
    conditions.push(lte(marketplaceTask.priceCredits, filters.maxPrice));
  }

  // Capability filter: check if the agent's capabilities JSON array contains the value.
  // Uses a subquery-style filter via a WHERE on the joined agent registration.
  if (filters.capability) {
    conditions.push(
      sql`${agentRegistration.capabilities}::jsonb @> ${JSON.stringify([filters.capability])}::jsonb`,
    );
  }

  const rows = await db
    .select({
      id: marketplaceTask.id,
      agentId: marketplaceTask.agentId,
      title: marketplaceTask.title,
      description: marketplaceTask.description,
      priceCredits: marketplaceTask.priceCredits,
      currency: marketplaceTask.currency,
      estimatedDurationMs: marketplaceTask.estimatedDurationMs,
      status: marketplaceTask.status,
      createdAt: marketplaceTask.createdAt,
      updatedAt: marketplaceTask.updatedAt,
      agentName: agentRegistration.name,
      agentTrustLevel: agentRegistration.trustLevel,
      organizationId: agentRegistration.organizationId,
    })
    .from(marketplaceTask)
    .innerJoin(
      agentRegistration,
      eq(marketplaceTask.agentId, agentRegistration.id),
    )
    .where(and(...conditions))
    .orderBy(desc(marketplaceTask.createdAt))
    .limit(limit);

  return rows;
}

/**
 * Create a marketplace task listing.
 */
export async function createMarketplaceTask(values: {
  agentId: string;
  title: string;
  description?: string;
  priceCredits: number;
  currency?: string;
  estimatedDurationMs?: number;
}): Promise<MarketplaceTask> {
  const [task] = await db
    .insert(marketplaceTask)
    .values({
      agentId: values.agentId,
      title: values.title,
      description: values.description ?? null,
      priceCredits: values.priceCredits,
      currency: values.currency ?? "USD",
      estimatedDurationMs: values.estimatedDurationMs ?? null,
    })
    .returning();

  return task;
}

/**
 * Get a marketplace task by ID.
 */
export async function getMarketplaceTaskById(
  taskId: string,
): Promise<MarketplaceTask | undefined> {
  const [task] = await db
    .select()
    .from(marketplaceTask)
    .where(eq(marketplaceTask.id, taskId))
    .limit(1);

  return task;
}

/**
 * Verify that an agent belongs to a given organization.
 */
export async function agentBelongsToOrg(
  agentId: string,
  orgId: string,
): Promise<boolean> {
  const [agent] = await db
    .select({ id: agentRegistration.id })
    .from(agentRegistration)
    .where(
      and(
        eq(agentRegistration.id, agentId),
        eq(agentRegistration.organizationId, orgId),
      ),
    )
    .limit(1);

  return !!agent;
}

// ---------------------------------------------------------------------------
// Escrow Transaction Queries
// ---------------------------------------------------------------------------

/**
 * Create an escrow: deduct credits from buyer org and hold them.
 * Returns the escrow record. Throws if buyer org has insufficient credits.
 */
export async function createEscrow(values: {
  taskId: string;
  buyerOrgId: string;
  sellerOrgId: string;
  amountCredits: number;
}): Promise<EscrowTransaction> {
  const commission = Math.ceil(values.amountCredits * COMMISSION_RATE);

  return db.transaction(async (tx) => {
    // Deduct credits from buyer org (atomic decrement with check)
    const [updated] = await tx
      .update(organization)
      .set({
        planCreditsRemaining: sql`${organization.planCreditsRemaining} - ${values.amountCredits}`,
      })
      .where(
        and(
          eq(organization.id, values.buyerOrgId),
          gte(organization.planCreditsRemaining, values.amountCredits),
        ),
      )
      .returning({ remaining: organization.planCreditsRemaining });

    if (!updated) {
      throw new Error("Insufficient credits");
    }

    // Create escrow record
    const [escrow] = await tx
      .insert(escrowTransaction)
      .values({
        taskId: values.taskId,
        buyerOrgId: values.buyerOrgId,
        sellerOrgId: values.sellerOrgId,
        amountCredits: values.amountCredits,
        commissionCredits: commission,
        status: "held",
      })
      .returning();

    return escrow;
  });
}

/**
 * Get an escrow transaction by ID.
 */
export async function getEscrowById(
  escrowId: string,
): Promise<EscrowTransaction | undefined> {
  const [escrow] = await db
    .select()
    .from(escrowTransaction)
    .where(eq(escrowTransaction.id, escrowId))
    .limit(1);

  return escrow;
}

/**
 * Release escrow: transfer net credits to the seller org, commission stays with platform.
 */
export async function releaseEscrow(
  escrowId: string,
): Promise<EscrowTransaction> {
  return db.transaction(async (tx) => {
    // Lock and verify escrow is still held
    const [escrow] = await tx
      .select()
      .from(escrowTransaction)
      .where(
        and(
          eq(escrowTransaction.id, escrowId),
          eq(escrowTransaction.status, "held"),
        ),
      )
      .limit(1);

    if (!escrow) {
      throw new Error("Escrow not found or not in held state");
    }

    const netAmount = escrow.amountCredits - escrow.commissionCredits;

    // Credit seller org
    await tx
      .update(organization)
      .set({
        planCreditsRemaining: sql`${organization.planCreditsRemaining} + ${netAmount}`,
      })
      .where(eq(organization.id, escrow.sellerOrgId));

    // Mark escrow as released
    const [released] = await tx
      .update(escrowTransaction)
      .set({
        status: "released",
        releasedAt: new Date(),
      })
      .where(eq(escrowTransaction.id, escrowId))
      .returning();

    return released;
  });
}

/**
 * Refund escrow: return full credits to the buyer org.
 */
export async function refundEscrow(
  escrowId: string,
): Promise<EscrowTransaction> {
  return db.transaction(async (tx) => {
    const [escrow] = await tx
      .select()
      .from(escrowTransaction)
      .where(
        and(
          eq(escrowTransaction.id, escrowId),
          eq(escrowTransaction.status, "held"),
        ),
      )
      .limit(1);

    if (!escrow) {
      throw new Error("Escrow not found or not in held state");
    }

    // Return credits to buyer
    await tx
      .update(organization)
      .set({
        planCreditsRemaining: sql`${organization.planCreditsRemaining} + ${escrow.amountCredits}`,
      })
      .where(eq(organization.id, escrow.buyerOrgId));

    // Mark as refunded
    const [refunded] = await tx
      .update(escrowTransaction)
      .set({ status: "refunded" })
      .where(eq(escrowTransaction.id, escrowId))
      .returning();

    return refunded;
  });
}

/**
 * Dispute escrow: mark as disputed with a reason. Credits remain held
 * until manual resolution.
 */
export async function disputeEscrow(
  escrowId: string,
  reason: string,
): Promise<EscrowTransaction> {
  const [disputed] = await db
    .update(escrowTransaction)
    .set({
      status: "disputed",
      disputeReason: reason,
    })
    .where(
      and(
        eq(escrowTransaction.id, escrowId),
        eq(escrowTransaction.status, "held"),
      ),
    )
    .returning();

  if (!disputed) {
    throw new Error("Escrow not found or not in held state");
  }

  return disputed;
}
