import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "./client";
import { agent } from "./schema";

/**
 * List all agents owned by a user.
 */
export async function getUserAgents(userId: string) {
  return db
    .select()
    .from(agent)
    .where(eq(agent.userId, userId))
    .orderBy(agent.createdAt);
}

/**
 * Get a single agent by ID, scoped to the owner.
 */
export async function getAgentByIdForUser(agentId: string, userId: string) {
  const rows = await db
    .select()
    .from(agent)
    .where(and(eq(agent.id, agentId), eq(agent.userId, userId)))
    .limit(1);

  return rows[0] ?? null;
}

/**
 * Revoke an agent — sets status to "revoked" and records the timestamp.
 */
export async function revokeAgent(agentId: string, userId: string) {
  const rows = await db
    .update(agent)
    .set({
      status: "revoked",
      revokedAt: new Date(),
    })
    .where(and(eq(agent.id, agentId), eq(agent.userId, userId)))
    .returning();

  return rows[0] ?? null;
}
