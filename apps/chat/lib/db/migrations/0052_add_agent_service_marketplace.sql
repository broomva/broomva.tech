-- Agent Service Marketplace tables
-- Services: discoverable agent capabilities with pricing
-- Transactions: records of service invocations between agents

CREATE TABLE "AgentService" (
	"id" text PRIMARY KEY NOT NULL,
	"agentId" text NOT NULL,
	"userId" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" text NOT NULL,
	"pricing" json NOT NULL,
	"endpoint" text,
	"capabilities" json DEFAULT '[]',
	"trustMinimum" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"callCount" integer DEFAULT 0 NOT NULL,
	"totalRevenue" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "MarketplaceTransaction" (
	"id" text PRIMARY KEY NOT NULL,
	"serviceId" text NOT NULL,
	"buyerAgentId" text NOT NULL,
	"sellerAgentId" text NOT NULL,
	"amountMicroUsd" integer NOT NULL,
	"facilitatorFeeMicroUsd" integer DEFAULT 0 NOT NULL,
	"status" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"completedAt" timestamp
);
--> statement-breakpoint
ALTER TABLE "AgentService" ADD CONSTRAINT "AgentService_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "AgentService_agent_id_idx" ON "AgentService" USING btree ("agentId");
--> statement-breakpoint
CREATE INDEX "AgentService_user_id_idx" ON "AgentService" USING btree ("userId");
--> statement-breakpoint
CREATE INDEX "AgentService_category_idx" ON "AgentService" USING btree ("category");
--> statement-breakpoint
CREATE INDEX "AgentService_status_idx" ON "AgentService" USING btree ("status");
--> statement-breakpoint
CREATE INDEX "MarketplaceTransaction_service_id_idx" ON "MarketplaceTransaction" USING btree ("serviceId");
--> statement-breakpoint
CREATE INDEX "MarketplaceTransaction_buyer_idx" ON "MarketplaceTransaction" USING btree ("buyerAgentId");
--> statement-breakpoint
CREATE INDEX "MarketplaceTransaction_seller_idx" ON "MarketplaceTransaction" USING btree ("sellerAgentId");
--> statement-breakpoint
CREATE INDEX "MarketplaceTransaction_status_idx" ON "MarketplaceTransaction" USING btree ("status");
