-- BRO-60: Per-agent audit trail and usage metering
-- Adds agentId to UsageEvent and AuditLog for per-agent attribution.
-- The Agent table already exists from BRO-56.

-- Add agent tracking to usage events
ALTER TABLE "UsageEvent" ADD COLUMN IF NOT EXISTS "agentId" TEXT;
CREATE INDEX IF NOT EXISTS "UsageEvent_agent_id_idx" ON "UsageEvent"("agentId");

-- Add agent tracking to audit log
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "agentId" TEXT;
CREATE INDEX IF NOT EXISTS "AuditLog_agent_id_idx" ON "AuditLog"("agentId");
