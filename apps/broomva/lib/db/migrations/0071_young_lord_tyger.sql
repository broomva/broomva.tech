CREATE TYPE "public"."spec_doc_state" AS ENUM('draft', 'published', 'superseded', 'archived', 'expired');--> statement-breakpoint
ALTER TABLE "SpecDoc" ADD COLUMN "handle" text;--> statement-breakpoint
ALTER TABLE "SpecDoc" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "SpecDoc" ADD COLUMN "state" "spec_doc_state" DEFAULT 'published' NOT NULL;--> statement-breakpoint
ALTER TABLE "SpecDoc" ADD COLUMN "ticketId" text;--> statement-breakpoint
ALTER TABLE "SpecDoc" ADD COLUMN "prNumber" integer;--> statement-breakpoint
ALTER TABLE "SpecDoc" ADD COLUMN "sessionId" text;--> statement-breakpoint
ALTER TABLE "SpecDoc" ADD COLUMN "expiresAt" timestamp;--> statement-breakpoint
ALTER TABLE "SpecDoc" ADD COLUMN "deletedAt" timestamp;--> statement-breakpoint
CREATE UNIQUE INDEX "SpecDoc_owner_handle_version_uq" ON "SpecDoc" USING btree ("ownerId","handle","version");--> statement-breakpoint
-- BRO-1300 backfill: pre-lifecycle rows become version 1 of a handle equal to
-- their id (version/state already defaulted on ADD COLUMN). Keeps every
-- existing /d/<id> URL resolving once the read path treats <ref> as handle-or-id.
UPDATE "SpecDoc" SET "handle" = "id" WHERE "handle" IS NULL;
