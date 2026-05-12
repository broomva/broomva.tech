-- Add slug, links, and deletedAt columns to UserPrompt table (idempotent)

ALTER TABLE "UserPrompt" ADD COLUMN IF NOT EXISTS "slug" varchar(256);
ALTER TABLE "UserPrompt" ADD COLUMN IF NOT EXISTS "links" json;
ALTER TABLE "UserPrompt" ADD COLUMN IF NOT EXISTS "deletedAt" timestamp;

-- Backfill slug from title for existing rows
UPDATE "UserPrompt" SET "slug" = LOWER(REGEXP_REPLACE(REPLACE(title, ' ', '-'), '[^a-z0-9-]', '', 'g')) WHERE "slug" IS NULL;

-- Ensure uniqueness by appending id suffix to any duplicates
WITH dupes AS (
  SELECT id, slug, ROW_NUMBER() OVER (PARTITION BY slug ORDER BY "createdAt") AS rn
  FROM "UserPrompt"
)
UPDATE "UserPrompt" SET slug = "UserPrompt".slug || '-' || SUBSTRING("UserPrompt".id::text, 1, 8)
FROM dupes WHERE "UserPrompt".id = dupes.id AND dupes.rn > 1;

-- Make slug NOT NULL and add unique index (idempotent)
ALTER TABLE "UserPrompt" ALTER COLUMN "slug" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "UserPrompt_slug_unique" ON "UserPrompt" ("slug");
