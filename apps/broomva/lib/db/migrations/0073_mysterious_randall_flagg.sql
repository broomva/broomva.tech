CREATE TYPE "public"."spec_doc_altitude" AS ENUM('task', 'feature', 'project', 'initiative');--> statement-breakpoint
CREATE TYPE "public"."spec_doc_orch_state" AS ENUM('proposed', 'reviewing', 'triggered', 'running', 'blocked', 'review', 'done', 'canceled');--> statement-breakpoint
ALTER TABLE "SpecDoc" ADD COLUMN "orchState" "spec_doc_orch_state" DEFAULT 'proposed' NOT NULL;--> statement-breakpoint
ALTER TABLE "SpecDoc" ADD COLUMN "altitude" "spec_doc_altitude" DEFAULT 'task' NOT NULL;--> statement-breakpoint
ALTER TABLE "SpecDoc" ADD COLUMN "dispatchCount" integer DEFAULT 0 NOT NULL;