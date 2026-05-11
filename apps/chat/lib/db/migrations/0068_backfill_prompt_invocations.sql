-- Seed historical web copies into prompt_invocation so the new aggregate
-- matches the legacy copyCount column. One row per UserPrompt with
-- copyCount > 0, attributed to source='web', status='completed',
-- caller='backfill'. Idempotent: re-running won't double-insert.

INSERT INTO "PromptInvocation" (
  "id", "promptSlug", "promptVersion", "source", "caller",
  "status", "createdAt", "completedAt"
)
SELECT
  gen_random_uuid(),
  "slug",
  COALESCE("version", '1.0'),
  'web'::prompt_invocation_source,
  'backfill',
  'completed'::prompt_invocation_status,
  "updatedAt",
  "updatedAt"
FROM "UserPrompt"
WHERE "copyCount" > 0
  AND NOT EXISTS (
    SELECT 1 FROM "PromptInvocation" pi
    WHERE pi."promptSlug" = "UserPrompt"."slug"
      AND pi."caller" = 'backfill'
  );
