-- Add nameId column to McpConnector
-- nameId is the namespace used for tool IDs, unique per user
ALTER TABLE "McpConnector" ADD COLUMN "nameId" varchar(256);
--> statement-breakpoint
-- Backfill existing rows with a nameId generated from the name
-- Logic: lowercase, replace non-alphanum with _, collapse underscores, trim
UPDATE "McpConnector"
SET "nameId" = (
  SELECT
    CASE
      WHEN clean_name = '' THEN 'mcp'
      WHEN clean_name = 'global' THEN 'mcp_global'
      ELSE clean_name
    END
  FROM (
    SELECT REGEXP_REPLACE(
      REGEXP_REPLACE(
        REGEXP_REPLACE(LOWER("name"), '[^a-z0-9]', '_', 'g'),
        '_+', '_', 'g'
      ),
      '^_|_$', '', 'g'
    ) AS clean_name
  ) AS subq
)
WHERE "nameId" IS NULL;
--> statement-breakpoint
-- Handle collision: append row number suffix for duplicates within same userId
WITH duplicates AS (
  SELECT id, "userId", "nameId",
    ROW_NUMBER() OVER (PARTITION BY "userId", "nameId" ORDER BY "createdAt") as rn
  FROM "McpConnector"
)
UPDATE "McpConnector" mc
SET "nameId" = mc."nameId" || '_' || (d.rn - 1)
FROM duplicates d
WHERE mc.id = d.id AND d.rn > 1;
--> statement-breakpoint
-- Now make nameId NOT NULL
ALTER TABLE "McpConnector" ALTER COLUMN "nameId" SET NOT NULL;
--> statement-breakpoint
-- Add index for userId + nameId lookups
CREATE INDEX IF NOT EXISTS "McpConnector_user_name_id_idx" ON "McpConnector" USING btree ("userId", "nameId");
