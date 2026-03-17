-- Encrypt sensitive OAuth data at rest
-- WARNING: This migration clears existing OAuth sessions since we can't encrypt
-- existing plaintext data without the encryption key at migration time.
-- Users will need to re-authenticate their MCP connectors.

-- Clear existing OAuth sessions (they contain unencrypted sensitive data)
DELETE FROM "McpOAuthSession";--> statement-breakpoint

-- Change column types from json to text for encrypted storage
ALTER TABLE "McpOAuthSession" ALTER COLUMN "clientInfo" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "McpOAuthSession" ALTER COLUMN "tokens" SET DATA TYPE text;