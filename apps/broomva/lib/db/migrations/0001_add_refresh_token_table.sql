-- BRO-121: Add RefreshToken table for Life JWT refresh flow
-- Access tokens reduced from 7d to 24h; refresh tokens (7d) enable renewal.

CREATE TABLE IF NOT EXISTS "RefreshToken" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "tokenHash" varchar(64) NOT NULL UNIQUE,
  "expiresAt" timestamp NOT NULL,
  "revokedAt" timestamp,
  "createdAt" timestamp DEFAULT now() NOT NULL
);

-- Index for user lookups (revoke-all, audit)
CREATE INDEX IF NOT EXISTS "RefreshToken_user_id_idx" ON "RefreshToken" ("userId");

-- Index for token hash lookups (refresh flow — the hot path)
CREATE INDEX IF NOT EXISTS "RefreshToken_token_hash_idx" ON "RefreshToken" ("tokenHash");

-- Index for expiry-based cleanup
CREATE INDEX IF NOT EXISTS "RefreshToken_expires_at_idx" ON "RefreshToken" ("expiresAt");
