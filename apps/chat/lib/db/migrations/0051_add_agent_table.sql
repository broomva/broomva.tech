-- BRO-56: Add agent key identity columns to existing Agent table
-- The Agent table was created in 0051_add_agent_audit_columns.sql (BRO-60).
-- This migration adds the deterministic agentKeyId and unique indexes for
-- CLI agent identity registration.

-- Add deterministic key ID column (first 16 hex chars of SHA-256 of publicKey)
ALTER TABLE "Agent" ADD COLUMN IF NOT EXISTS "agentKeyId" VARCHAR(64);

-- Add 'expired' as valid status (existing enum had active/revoked)
-- PostgreSQL varchar enums don't need ALTER TYPE, the check is app-level.

-- Unique index on agentKeyId for fast lookup during agent registration
CREATE UNIQUE INDEX IF NOT EXISTS "Agent_agent_key_id_unique" ON "Agent"("agentKeyId");

-- Unique index on publicKey to prevent duplicate key registrations
CREATE UNIQUE INDEX IF NOT EXISTS "Agent_public_key_unique" ON "Agent"("publicKey");
