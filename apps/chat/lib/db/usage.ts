import "server-only";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "./client";
import { usageEvent } from "./schema";

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
