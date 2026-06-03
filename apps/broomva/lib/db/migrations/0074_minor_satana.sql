CREATE TYPE "public"."spec_doc_run_status" AS ENUM('queued', 'running', 'blocked', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TABLE "SpecDocRun" (
	"id" text PRIMARY KEY NOT NULL,
	"specDocId" text NOT NULL,
	"ownerId" text NOT NULL,
	"handle" text NOT NULL,
	"specVersion" integer NOT NULL,
	"target" json NOT NULL,
	"status" "spec_doc_run_status" DEFAULT 'queued' NOT NULL,
	"runRef" text,
	"attempt" integer DEFAULT 1 NOT NULL,
	"maxAttempts" integer DEFAULT 3 NOT NULL,
	"lastSeq" integer DEFAULT 0 NOT NULL,
	"receipt" json,
	"idempotencyKey" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "SpecDocRun" ADD CONSTRAINT "SpecDocRun_specDocId_SpecDoc_id_fk" FOREIGN KEY ("specDocId") REFERENCES "public"."SpecDoc"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "SpecDocRun" ADD CONSTRAINT "SpecDocRun_ownerId_user_id_fk" FOREIGN KEY ("ownerId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "SpecDocRun_owner_created_idx" ON "SpecDocRun" USING btree ("ownerId","createdAt");--> statement-breakpoint
CREATE INDEX "SpecDocRun_specDoc_idx" ON "SpecDocRun" USING btree ("specDocId");--> statement-breakpoint
CREATE UNIQUE INDEX "SpecDocRun_idempotency_uq" ON "SpecDocRun" USING btree ("idempotencyKey");