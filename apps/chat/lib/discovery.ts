import { and, desc, eq, gte, lte, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { agentRegistration } from "@/lib/db/schema";

// ---------------------------------------------------------------------------
// Capability Taxonomy
// ---------------------------------------------------------------------------

export const CAPABILITY_TAXONOMY = [
  "code-generation",
  "code-review",
  "data-analysis",
  "research",
  "writing",
  "translation",
  "image-generation",
  "web-search",
  "file-management",
  "api-integration",
  "testing",
  "deployment",
  "monitoring",
  "security-audit",
  "financial-analysis",
  "customer-support",
  "scheduling",
  "summarization",
] as const;

export type Capability = (typeof CAPABILITY_TAXONOMY)[number];

// ---------------------------------------------------------------------------
// Filter types
// ---------------------------------------------------------------------------

export interface AgentSearchFilters {
  capability?: string;
  minTrust?: number;
  maxTrust?: number;
  trustLevel?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

// ---------------------------------------------------------------------------
// Search agents with dynamic filters
// ---------------------------------------------------------------------------

export async function searchAgents(filters: AgentSearchFilters) {
  const {
    capability,
    minTrust,
    maxTrust,
    trustLevel,
    status = "certified",
    limit = 20,
    offset = 0,
  } = filters;

  const conditions: SQL[] = [];

  // Default: only certified agents
  if (status) {
    conditions.push(eq(agentRegistration.status, status));
  }

  if (trustLevel) {
    conditions.push(eq(agentRegistration.trustLevel, trustLevel));
  }

  if (minTrust !== undefined) {
    conditions.push(gte(agentRegistration.trustScore, minTrust));
  }

  if (maxTrust !== undefined) {
    conditions.push(lte(agentRegistration.trustScore, maxTrust));
  }

  // Capability filter: check if the JSON array contains the value.
  // capabilities is stored as a json string array, so we use a SQL contains check.
  if (capability) {
    conditions.push(
      sql`${agentRegistration.capabilities}::jsonb @> ${JSON.stringify([capability])}::jsonb`,
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [agents, countResult] = await Promise.all([
    db
      .select()
      .from(agentRegistration)
      .where(where)
      .orderBy(desc(agentRegistration.trustScore))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(agentRegistration)
      .where(where),
  ]);

  return {
    agents,
    total: countResult[0]?.count ?? 0,
    limit,
    offset,
  };
}

// ---------------------------------------------------------------------------
// Single agent lookup
// ---------------------------------------------------------------------------

export async function getAgentById(id: string) {
  const results = await db
    .select()
    .from(agentRegistration)
    .where(eq(agentRegistration.id, id))
    .limit(1);

  return results[0] ?? null;
}

// ---------------------------------------------------------------------------
// All agents for an organization
// ---------------------------------------------------------------------------

export async function getAgentsByOrganization(orgId: string) {
  return db
    .select()
    .from(agentRegistration)
    .where(eq(agentRegistration.organizationId, orgId))
    .orderBy(desc(agentRegistration.trustScore));
}
