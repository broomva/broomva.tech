-- BRO-56: Add agent key identity columns to existing Agent table
-- The Agent table was created via drizzle-kit push or an earlier migration.
-- This migration adds the deterministic agentKeyId and unique indexes for
-- CLI agent identity registration.

-- Create Agent table if it doesn't exist yet (safety net for clean DBs)
CREATE TABLE IF NOT EXISTS "Agent" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "name" varchar(256) NOT NULL,
  "publicKey" text,
  "agentKeyId" varchar(64),
  "capabilities" json DEFAULT '[]'::json,
  "status" varchar DEFAULT 'active' NOT NULL,
  "lastActiveAt" timestamp,
  "revokedAt" timestamp,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);

-- Add deterministic key ID column (first 16 hex chars of SHA-256 of publicKey)
ALTER TABLE "Agent" ADD COLUMN IF NOT EXISTS "agentKeyId" VARCHAR(64);

-- Unique index on agentKeyId for fast lookup during agent registration
CREATE UNIQUE INDEX IF NOT EXISTS "Agent_agent_key_id_unique" ON "Agent"("agentKeyId");

-- Unique index on publicKey to prevent duplicate key registrations
CREATE UNIQUE INDEX IF NOT EXISTS "Agent_public_key_unique" ON "Agent"("publicKey");

-- Standard indexes
CREATE INDEX IF NOT EXISTS "Agent_user_id_idx" ON "Agent"("userId");
CREATE INDEX IF NOT EXISTS "Agent_status_idx" ON "Agent"("status");
