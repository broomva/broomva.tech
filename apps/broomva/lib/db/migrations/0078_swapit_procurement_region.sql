ALTER TABLE "swapit_fact" ADD COLUMN "region" text;--> statement-breakpoint
CREATE INDEX "swapit_fact_kind_region_idx" ON "swapit_fact" USING btree ("kind","region");
