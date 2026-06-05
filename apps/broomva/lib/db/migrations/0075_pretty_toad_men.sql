CREATE TYPE "public"."handoff_event_type" AS ENUM('pushed', 'picked_up', 'completed', 'archived', 'restored', 'superseded', 'linked', 'note');--> statement-breakpoint
CREATE TYPE "public"."handoff_status" AS ENUM('queued', 'in_progress', 'done', 'archived', 'superseded');--> statement-breakpoint
CREATE TABLE "Handoff" (
	"id" text PRIMARY KEY NOT NULL,
	"ownerId" text NOT NULL,
	"slug" text,
	"version" integer DEFAULT 1 NOT NULL,
	"status" "handoff_status" DEFAULT 'queued' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"title" text NOT NULL,
	"tldr" text,
	"body" text NOT NULL,
	"firstAction" text,
	"specRefs" json DEFAULT '[]'::json NOT NULL,
	"sourceRepo" text,
	"sourcePath" text,
	"sourceCommit" varchar(64),
	"branch" text,
	"ticketId" text,
	"prNumber" integer,
	"sessionId" text,
	"pickedUpAt" timestamp,
	"completedAt" timestamp,
	"expiresAt" timestamp,
	"deletedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "HandoffEvent" (
	"id" text PRIMARY KEY NOT NULL,
	"handoffId" text NOT NULL,
	"ownerId" text NOT NULL,
	"type" "handoff_event_type" NOT NULL,
	"actor" varchar(32) DEFAULT 'system' NOT NULL,
	"message" text,
	"metadata" json,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "Handoff" ADD CONSTRAINT "Handoff_ownerId_user_id_fk" FOREIGN KEY ("ownerId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "HandoffEvent" ADD CONSTRAINT "HandoffEvent_handoffId_Handoff_id_fk" FOREIGN KEY ("handoffId") REFERENCES "public"."Handoff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "HandoffEvent" ADD CONSTRAINT "HandoffEvent_ownerId_user_id_fk" FOREIGN KEY ("ownerId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "Handoff_owner_created_idx" ON "Handoff" USING btree ("ownerId","createdAt");--> statement-breakpoint
CREATE INDEX "Handoff_owner_status_idx" ON "Handoff" USING btree ("ownerId","status");--> statement-breakpoint
CREATE UNIQUE INDEX "Handoff_owner_slug_version_uq" ON "Handoff" USING btree ("ownerId","slug","version");--> statement-breakpoint
CREATE INDEX "HandoffEvent_owner_created_idx" ON "HandoffEvent" USING btree ("ownerId","createdAt");--> statement-breakpoint
CREATE INDEX "HandoffEvent_handoff_idx" ON "HandoffEvent" USING btree ("handoffId");