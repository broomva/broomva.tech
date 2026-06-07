ALTER TABLE "SpecDoc" ADD COLUMN "visibility" varchar DEFAULT 'private' NOT NULL;
ALTER TABLE "SpecDoc" ADD COLUMN "publicAt" timestamp;
ALTER TABLE "SpecDoc" ADD COLUMN "unpublishedAt" timestamp;

ALTER TABLE "Handoff" ADD COLUMN "visibility" varchar DEFAULT 'private' NOT NULL;
ALTER TABLE "Handoff" ADD COLUMN "publicAt" timestamp;
ALTER TABLE "Handoff" ADD COLUMN "unpublishedAt" timestamp;

CREATE INDEX "SpecDoc_visibility_handle_idx" ON "SpecDoc" ("visibility","handle","version");
CREATE INDEX "Handoff_visibility_slug_idx" ON "Handoff" ("visibility","slug","version");
