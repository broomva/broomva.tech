-- Enums shared with prompt_feedback are created here so 0066 owns them.

CREATE TYPE "prompt_invocation_source" AS ENUM ('web', 'cli', 'skill', 'api');
CREATE TYPE "prompt_invocation_status" AS ENUM ('pulled', 'completed', 'failed', 'abandoned');

CREATE TABLE IF NOT EXISTS "PromptInvocation" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "promptSlug" varchar(256) NOT NULL,
  "promptVersion" varchar(32) NOT NULL,
  "source" "prompt_invocation_source" NOT NULL,
  "caller" varchar(128),
  "userId" text REFERENCES "user"("id") ON DELETE SET NULL,
  "agentId" text,
  "sessionId" uuid,
  "clientIpHash" varchar(64),
  "variables" json,
  "status" "prompt_invocation_status" NOT NULL DEFAULT 'pulled',
  "model" varchar(64),
  "latencyMs" integer,
  "tokensIn" integer,
  "tokensOut" integer,
  "costUsd" numeric(10, 6),
  "errorMessage" text,
  "externalTraceId" varchar(128),
  "externalSpanId" varchar(128),
  "metadata" json,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "completedAt" timestamp
);

CREATE INDEX IF NOT EXISTS "PromptInvocation_slug_created_idx"
  ON "PromptInvocation" ("promptSlug", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "PromptInvocation_created_idx"
  ON "PromptInvocation" ("createdAt" DESC);
CREATE INDEX IF NOT EXISTS "PromptInvocation_source_created_idx"
  ON "PromptInvocation" ("source", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "PromptInvocation_user_created_idx"
  ON "PromptInvocation" ("userId", "createdAt" DESC)
  WHERE "userId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "PromptInvocation_status_idx"
  ON "PromptInvocation" ("status")
  WHERE "status" = 'pulled';
