CREATE TABLE IF NOT EXISTS "Agent" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" text NOT NULL,
	"name" varchar(256) NOT NULL,
	"publicKey" text,
	"agentKeyId" varchar(64),
	"capabilities" json DEFAULT '[]'::json,
	"status" varchar DEFAULT 'active' NOT NULL,
	"lastActiveAt" timestamp,
	"revokedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "AgentService" (
	"id" text PRIMARY KEY NOT NULL,
	"agentId" text NOT NULL,
	"userId" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" text NOT NULL,
	"pricing" json NOT NULL,
	"endpoint" text,
	"capabilities" json DEFAULT '[]'::json,
	"trustMinimum" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"callCount" integer DEFAULT 0 NOT NULL,
	"totalRevenue" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "MarketplaceTransaction" (
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
CREATE TABLE IF NOT EXISTS "OrganizationArcanRole" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizationId" uuid NOT NULL,
	"roleName" varchar(128) NOT NULL,
	"allowCapabilities" json DEFAULT '[]'::json NOT NULL,
	"maxEventsPerTurn" integer DEFAULT 20 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "OrganizationCustomSkill" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizationId" uuid NOT NULL,
	"name" varchar(256) NOT NULL,
	"manifestToml" text NOT NULL,
	"assignedRoles" json DEFAULT '[]'::json NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "OrganizationMcpServer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizationId" uuid NOT NULL,
	"name" varchar(256) NOT NULL,
	"url" text NOT NULL,
	"bearerToken" text,
	"assignedRoles" json DEFAULT '[]'::json NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "RefreshToken" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" text NOT NULL,
	"tokenHash" varchar(64) NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"revokedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "RefreshToken_tokenHash_unique" UNIQUE("tokenHash")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "RelayNode" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" text NOT NULL,
	"name" varchar(128) NOT NULL,
	"hostname" varchar(256),
	"status" varchar(16) DEFAULT 'offline' NOT NULL,
	"lastSeenAt" timestamp,
	"capabilities" json DEFAULT '[]'::json,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "RelaySession" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nodeId" uuid NOT NULL,
	"userId" text NOT NULL,
	"sessionType" varchar(32) NOT NULL,
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"name" varchar(256),
	"workdir" varchar(1024),
	"remoteSessionId" varchar(256),
	"lastSequence" integer DEFAULT 0 NOT NULL,
	"model" varchar(128),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "SandboxInstance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizationId" uuid,
	"agentId" uuid,
	"sandboxId" varchar(256) NOT NULL,
	"sessionId" varchar(256),
	"provider" varchar(32) NOT NULL,
	"status" varchar(32) DEFAULT 'starting' NOT NULL,
	"vcpus" integer,
	"memoryMb" integer,
	"persistent" boolean DEFAULT false NOT NULL,
	"lastExecAt" timestamp,
	"execCount" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "SandboxInstance_sandboxId_unique" UNIQUE("sandboxId")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "SandboxSnapshot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sandboxInstanceId" uuid NOT NULL,
	"snapshotId" varchar(256) NOT NULL,
	"trigger" varchar(32) NOT NULL,
	"sizeBytes" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "agentId" text;--> statement-breakpoint
ALTER TABLE "UsageEvent" ADD COLUMN IF NOT EXISTS "agentId" text;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "Agent" ADD CONSTRAINT "Agent_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "AgentService" ADD CONSTRAINT "AgentService_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "OrganizationArcanRole" ADD CONSTRAINT "OrganizationArcanRole_organizationId_Organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "OrganizationCustomSkill" ADD CONSTRAINT "OrganizationCustomSkill_organizationId_Organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "OrganizationMcpServer" ADD CONSTRAINT "OrganizationMcpServer_organizationId_Organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "RelayNode" ADD CONSTRAINT "RelayNode_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "RelaySession" ADD CONSTRAINT "RelaySession_nodeId_RelayNode_id_fk" FOREIGN KEY ("nodeId") REFERENCES "public"."RelayNode"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "RelaySession" ADD CONSTRAINT "RelaySession_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "SandboxInstance" ADD CONSTRAINT "SandboxInstance_organizationId_Organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "SandboxInstance" ADD CONSTRAINT "SandboxInstance_agentId_AgentRegistration_id_fk" FOREIGN KEY ("agentId") REFERENCES "public"."AgentRegistration"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "SandboxSnapshot" ADD CONSTRAINT "SandboxSnapshot_sandboxInstanceId_SandboxInstance_id_fk" FOREIGN KEY ("sandboxInstanceId") REFERENCES "public"."SandboxInstance"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Agent_user_id_idx" ON "Agent" USING btree ("userId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Agent_status_idx" ON "Agent" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "Agent_agent_key_id_unique" ON "Agent" USING btree ("agentKeyId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "Agent_public_key_unique" ON "Agent" USING btree ("publicKey");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "AgentService_agent_id_idx" ON "AgentService" USING btree ("agentId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "AgentService_user_id_idx" ON "AgentService" USING btree ("userId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "AgentService_category_idx" ON "AgentService" USING btree ("category");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "AgentService_status_idx" ON "AgentService" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "MarketplaceTransaction_service_id_idx" ON "MarketplaceTransaction" USING btree ("serviceId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "MarketplaceTransaction_buyer_idx" ON "MarketplaceTransaction" USING btree ("buyerAgentId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "MarketplaceTransaction_seller_idx" ON "MarketplaceTransaction" USING btree ("sellerAgentId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "MarketplaceTransaction_status_idx" ON "MarketplaceTransaction" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "OrgArcanRole_org_idx" ON "OrganizationArcanRole" USING btree ("organizationId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "OrgArcanRole_org_role_unique" ON "OrganizationArcanRole" USING btree ("organizationId","roleName");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "OrgCustomSkill_org_idx" ON "OrganizationCustomSkill" USING btree ("organizationId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "OrgCustomSkill_org_name_unique" ON "OrganizationCustomSkill" USING btree ("organizationId","name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "OrgMcpServer_org_idx" ON "OrganizationMcpServer" USING btree ("organizationId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "OrgMcpServer_org_name_unique" ON "OrganizationMcpServer" USING btree ("organizationId","name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "RefreshToken_user_id_idx" ON "RefreshToken" USING btree ("userId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "RefreshToken_token_hash_idx" ON "RefreshToken" USING btree ("tokenHash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "RefreshToken_expires_at_idx" ON "RefreshToken" USING btree ("expiresAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "RelayNode_user_idx" ON "RelayNode" USING btree ("userId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "RelayNode_status_idx" ON "RelayNode" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "RelaySession_node_idx" ON "RelaySession" USING btree ("nodeId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "RelaySession_user_idx" ON "RelaySession" USING btree ("userId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "RelaySession_status_idx" ON "RelaySession" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "SandboxInstance_org_idx" ON "SandboxInstance" USING btree ("organizationId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "SandboxInstance_agent_idx" ON "SandboxInstance" USING btree ("agentId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "SandboxInstance_status_idx" ON "SandboxInstance" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "SandboxInstance_provider_idx" ON "SandboxInstance" USING btree ("provider");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "SandboxSnapshot_instance_idx" ON "SandboxSnapshot" USING btree ("sandboxInstanceId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "AuditLog_agent_id_idx" ON "AuditLog" USING btree ("agentId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "UsageEvent_agent_id_idx" ON "UsageEvent" USING btree ("agentId");
