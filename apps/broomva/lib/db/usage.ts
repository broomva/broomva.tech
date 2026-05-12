import "server-only";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "./client";
import { organization, usageEvent } from "./schema";

/**
 * Atomically deduct credits from an organization's planCreditsRemaining.
 * Returns true if the deduction succeeded (org had enough credits), false otherwise.
 */
export async function deductOrgCredits(
  orgId: string,
  amount: number,
): Promise<boolean> {
  const rows = await db
    .update(organization)
    .set({
      planCreditsRemaining: sql`${organization.planCreditsRemaining} - ${amount}`,
    })
    .where(
      and(
        eq(organization.id, orgId),
        sql`${organization.planCreditsRemaining} >= ${amount}`,
      ),
    )
    .returning({ id: organization.id });

  // If the WHERE guard failed (insufficient credits), no rows are returned
  return rows.length > 0;
}

/**
 * Record a single usage event.
 */
export async function recordUsageEvent(params: {
  organizationId?: string;
  userId: string;
  type: string;
  resource?: string;
  inputTokens?: number;
  outputTokens?: number;
  costCents: number;
  chatId?: string;
  agentId?: string;
}): Promise<void> {
  await db.insert(usageEvent).values({
    organizationId: params.organizationId ?? null,
    userId: params.userId,
    type: params.type,
    resource: params.resource ?? null,
    inputTokens: params.inputTokens ?? null,
    outputTokens: params.outputTokens ?? null,
    costCents: params.costCents,
    chatId: params.chatId ?? null,
    agentId: params.agentId ?? null,
  });
}

/**
 * Aggregate usage for an organization within a date range, grouped by type and resource.
 */
export async function getUsageSummary(
  organizationId: string,
  startDate: Date,
  endDate: Date,
): Promise<
  Array<{
    type: string;
    resource: string | null;
    totalCostCents: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    eventCount: number;
  }>
> {
  const rows = await db
    .select({
      type: usageEvent.type,
      resource: usageEvent.resource,
      totalCostCents: sql<number>`coalesce(sum(${usageEvent.costCents}), 0)::int`,
      totalInputTokens: sql<number>`coalesce(sum(${usageEvent.inputTokens}), 0)::int`,
      totalOutputTokens: sql<number>`coalesce(sum(${usageEvent.outputTokens}), 0)::int`,
      eventCount: sql<number>`count(*)::int`,
    })
    .from(usageEvent)
    .where(
      and(
        eq(usageEvent.organizationId, organizationId),
        gte(usageEvent.createdAt, startDate),
        lte(usageEvent.createdAt, endDate),
      ),
    )
    .groupBy(usageEvent.type, usageEvent.resource);

  return rows;
}

/**
 * Aggregate usage for a specific agent, grouped by resource (model).
 */
export async function getAgentUsageSummary(agentId: string): Promise<{
  totalCostCents: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  eventCount: number;
  byModel: Array<{
    resource: string | null;
    totalCostCents: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    eventCount: number;
  }>;
}> {
  const rows = await db
    .select({
      resource: usageEvent.resource,
      totalCostCents: sql<number>`coalesce(sum(${usageEvent.costCents}), 0)::int`,
      totalInputTokens: sql<number>`coalesce(sum(${usageEvent.inputTokens}), 0)::int`,
      totalOutputTokens: sql<number>`coalesce(sum(${usageEvent.outputTokens}), 0)::int`,
      eventCount: sql<number>`count(*)::int`,
    })
    .from(usageEvent)
    .where(eq(usageEvent.agentId, agentId))
    .groupBy(usageEvent.resource);

  const totals = rows.reduce(
    (acc, r) => ({
      totalCostCents: acc.totalCostCents + r.totalCostCents,
      totalInputTokens: acc.totalInputTokens + r.totalInputTokens,
      totalOutputTokens: acc.totalOutputTokens + r.totalOutputTokens,
      eventCount: acc.eventCount + r.eventCount,
    }),
    {
      totalCostCents: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      eventCount: 0,
    },
  );

  return {
    ...totals,
    byModel: rows,
  };
}

/**
 * Aggregate usage for a user within a date range, grouped by type and resource.
 */
export async function getUserUsageSummary(
  userId: string,
  startDate: Date,
  endDate: Date,
): Promise<
  Array<{
    type: string;
    resource: string | null;
    totalCostCents: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    eventCount: number;
  }>
> {
  const rows = await db
    .select({
      type: usageEvent.type,
      resource: usageEvent.resource,
      totalCostCents: sql<number>`coalesce(sum(${usageEvent.costCents}), 0)::int`,
      totalInputTokens: sql<number>`coalesce(sum(${usageEvent.inputTokens}), 0)::int`,
      totalOutputTokens: sql<number>`coalesce(sum(${usageEvent.outputTokens}), 0)::int`,
      eventCount: sql<number>`count(*)::int`,
    })
    .from(usageEvent)
    .where(
      and(
        eq(usageEvent.userId, userId),
        gte(usageEvent.createdAt, startDate),
        lte(usageEvent.createdAt, endDate),
      ),
    )
    .groupBy(usageEvent.type, usageEvent.resource);

  return rows;
}
