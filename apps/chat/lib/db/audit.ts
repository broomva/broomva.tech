import "server-only";
import { db } from "./client";
import { auditLog } from "./schema";

/**
 * Insert an audit log entry. Non-blocking — errors are caught and logged
 * so callers are never disrupted by audit failures.
 */
export function logAudit(params: {
  organizationId?: string;
  actorId: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  agentId?: string;
}): void {
  db.insert(auditLog)
    .values({
      organizationId: params.organizationId ?? null,
      actorId: params.actorId,
      action: params.action,
      resourceType: params.resourceType ?? null,
      resourceId: params.resourceId ?? null,
      metadata: params.metadata ?? null,
      ipAddress: params.ipAddress ?? null,
      userAgent: params.userAgent ?? null,
      agentId: params.agentId ?? null,
    })
    .then(() => {})
    .catch((err) => {
      console.error("[audit] Failed to write audit log:", err);
    });
}
