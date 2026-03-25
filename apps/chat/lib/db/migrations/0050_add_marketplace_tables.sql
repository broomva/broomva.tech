CREATE TABLE IF NOT EXISTS "EscrowTransaction" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"taskId" uuid NOT NULL,
	"buyerOrgId" uuid NOT NULL,
	"sellerOrgId" uuid NOT NULL,
	"amountCredits" integer NOT NULL,
	"commissionCredits" integer DEFAULT 0 NOT NULL,
	"status" varchar DEFAULT 'held' NOT NULL,
	"heldAt" timestamp DEFAULT now() NOT NULL,
	"releasedAt" timestamp,
	"disputeReason" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "MarketplaceTask" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agentId" uuid NOT NULL,
	"title" varchar(256) NOT NULL,
	"description" text,
	"priceCredits" integer NOT NULL,
	"currency" varchar(8) DEFAULT 'USD' NOT NULL,
	"estimatedDurationMs" integer,
	"status" varchar DEFAULT 'active' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "EscrowTransaction" ADD CONSTRAINT "EscrowTransaction_taskId_MarketplaceTask_id_fk" FOREIGN KEY ("taskId") REFERENCES "public"."MarketplaceTask"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "EscrowTransaction" ADD CONSTRAINT "EscrowTransaction_buyerOrgId_Organization_id_fk" FOREIGN KEY ("buyerOrgId") REFERENCES "public"."Organization"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "EscrowTransaction" ADD CONSTRAINT "EscrowTransaction_sellerOrgId_Organization_id_fk" FOREIGN KEY ("sellerOrgId") REFERENCES "public"."Organization"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "MarketplaceTask" ADD CONSTRAINT "MarketplaceTask_agentId_AgentRegistration_id_fk" FOREIGN KEY ("agentId") REFERENCES "public"."AgentRegistration"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "EscrowTransaction_task_id_idx" ON "EscrowTransaction" USING btree ("taskId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "EscrowTransaction_buyer_idx" ON "EscrowTransaction" USING btree ("buyerOrgId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "EscrowTransaction_seller_idx" ON "EscrowTransaction" USING btree ("sellerOrgId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "EscrowTransaction_status_idx" ON "EscrowTransaction" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "MarketplaceTask_agent_id_idx" ON "MarketplaceTask" USING btree ("agentId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "MarketplaceTask_status_idx" ON "MarketplaceTask" USING btree ("status");
