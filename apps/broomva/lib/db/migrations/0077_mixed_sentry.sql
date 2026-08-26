CREATE TABLE "swapit_fact" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"payload" json NOT NULL,
	"confidence" numeric DEFAULT '0.5' NOT NULL,
	"corroboration_count" integer DEFAULT 1 NOT NULL,
	"contributors" json DEFAULT '[]'::json NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"first_seen" timestamp DEFAULT now() NOT NULL,
	"last_seen" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "swapit_fact_status_last_seen_idx" ON "swapit_fact" USING btree ("status","last_seen");--> statement-breakpoint
CREATE INDEX "swapit_fact_kind_idx" ON "swapit_fact" USING btree ("kind");
