/**
 * Relay node and session database queries.
 */

import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "./client";
import { relayNode, relaySession } from "./schema";

// ── Relay Nodes ───────────────────────────────────────────────────────────

export function getUserRelayNodes(userId: string) {
  return db
    .select()
    .from(relayNode)
    .where(eq(relayNode.userId, userId))
    .orderBy(desc(relayNode.updatedAt));
}

export async function getRelayNodeById(id: string, userId: string) {
  const rows = await db
    .select()
    .from(relayNode)
    .where(and(eq(relayNode.id, id), eq(relayNode.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

export function upsertRelayNode(
  userId: string,
  name: string,
  hostname: string,
  capabilities: string[],
) {
  return db
    .insert(relayNode)
    .values({
      userId,
      name,
      hostname,
      status: "online",
      lastSeenAt: new Date(),
      capabilities,
    })
    .returning();
}

export function updateRelayNodeStatus(
  id: string,
  status: "online" | "offline" | "degraded",
) {
  return db
    .update(relayNode)
    .set({ status, lastSeenAt: new Date() })
    .where(eq(relayNode.id, id));
}

// ── Relay Sessions ────────────────────────────────────────────────────────

export function getUserRelaySessions(userId: string) {
  return db
    .select()
    .from(relaySession)
    .where(eq(relaySession.userId, userId))
    .orderBy(desc(relaySession.updatedAt));
}

export function getNodeRelaySessions(nodeId: string) {
  return db
    .select()
    .from(relaySession)
    .where(eq(relaySession.nodeId, nodeId))
    .orderBy(desc(relaySession.createdAt));
}

export async function getRelaySessionById(id: string, userId: string) {
  const rows = await db
    .select()
    .from(relaySession)
    .where(and(eq(relaySession.id, id), eq(relaySession.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

export function createRelaySession(values: {
  nodeId: string;
  userId: string;
  sessionType: "arcan" | "claude-code" | "codex";
  name: string;
  workdir?: string;
  remoteSessionId?: string;
  model?: string;
}) {
  return db.insert(relaySession).values(values).returning();
}

export function updateRelaySessionStatus(
  id: string,
  status: "active" | "idle" | "completed" | "failed",
) {
  return db
    .update(relaySession)
    .set({ status })
    .where(eq(relaySession.id, id));
}

export function updateRelaySessionSequence(id: string, lastSequence: number) {
  return db
    .update(relaySession)
    .set({ lastSequence })
    .where(eq(relaySession.id, id));
}

// ── Metrics ───────────────────────────────────────────────────────────────

export async function getRelayMetrics(userId: string) {
  const [metrics] = await db
    .select({
      nodesOnline: sql<number>`count(distinct ${relayNode.id}) filter (where ${relayNode.status} = 'online')`,
      nodesTotal: sql<number>`count(distinct ${relayNode.id})`,
      sessionsActive: sql<number>`count(${relaySession.id}) filter (where ${relaySession.status} = 'active')`,
      sessionsTotal: sql<number>`count(${relaySession.id})`,
    })
    .from(relayNode)
    .leftJoin(relaySession, eq(relaySession.nodeId, relayNode.id))
    .where(eq(relayNode.userId, userId));

  return {
    nodesOnline: Number(metrics?.nodesOnline ?? 0),
    nodesTotal: Number(metrics?.nodesTotal ?? 0),
    sessionsActive: Number(metrics?.sessionsActive ?? 0),
    sessionsTotal: Number(metrics?.sessionsTotal ?? 0),
  };
}
