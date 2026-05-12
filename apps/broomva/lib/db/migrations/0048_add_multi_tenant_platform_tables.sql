CREATE TABLE IF NOT EXISTS "AuditLog" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizationId" uuid,
	"actorId" text,
	"action" varchar(256) NOT NULL,
	"resourceType" varchar(128),
	"resourceId" varchar(256),
	"metadata" json,
	"ipAddress" varchar(64),
	"userAgent" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Organization" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(256) NOT NULL,
	"slug" varchar(128) NOT NULL,
	"plan" varchar DEFAULT 'free' NOT NULL,
	"stripeCustomerId" varchar(256),
	"stripeSubscriptionId" varchar(256),
	"planCreditsMonthly" integer DEFAULT 50 NOT NULL,
	"planCreditsRemaining" integer DEFAULT 50 NOT NULL,
	"billingPeriodStart" timestamp,
	"neonBranchId" varchar(256),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "Organization_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "OrganizationApiKey" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizationId" uuid NOT NULL,
	"createdByUserId" text NOT NULL,
	"name" varchar(256) NOT NULL,
	"keyHash" varchar(256) NOT NULL,
	"keyPrefix" varchar(16) NOT NULL,
	"scopes" text DEFAULT '*' NOT NULL,
	"lastUsedAt" timestamp,
	"expiresAt" timestamp,
	"revokedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "OrganizationLifeInstance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizationId" uuid NOT NULL,
	"railwayProjectId" varchar(256),
	"railwayEnvironmentId" varchar(256),
	"status" varchar DEFAULT 'provisioning' NOT NULL,
	"arcanUrl" varchar(512),
	"lagoUrl" varchar(512),
	"autonomicUrl" varchar(512),
	"haimaUrl" varchar(512),
	"lastHealthCheck" timestamp,
	"lastHealthStatus" json,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "OrganizationMember" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizationId" uuid NOT NULL,
	"userId" text NOT NULL,
	"role" varchar DEFAULT 'member' NOT NULL,
	"invitedAt" timestamp,
	"joinedAt" timestamp DEFAULT now() NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "UsageEvent" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizationId" uuid,
	"userId" text NOT NULL,
	"type" varchar(64) NOT NULL,
	"resource" varchar(256),
	"inputTokens" integer,
	"outputTokens" integer,
	"costCents" integer NOT NULL,
	"chatId" uuid,
	"stripeMeterEventId" varchar(256),
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_organizationId_Organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_user_id_fk" FOREIGN KEY ("actorId") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "OrganizationApiKey" ADD CONSTRAINT "OrganizationApiKey_organizationId_Organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "OrganizationApiKey" ADD CONSTRAINT "OrganizationApiKey_createdByUserId_user_id_fk" FOREIGN KEY ("createdByUserId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "OrganizationLifeInstance" ADD CONSTRAINT "OrganizationLifeInstance_organizationId_Organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_organizationId_Organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_organizationId_Organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "AuditLog_org_id_idx" ON "AuditLog" USING btree ("organizationId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "AuditLog_actor_id_idx" ON "AuditLog" USING btree ("actorId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "AuditLog_action_idx" ON "AuditLog" USING btree ("action");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "AuditLog_created_at_idx" ON "AuditLog" USING btree ("createdAt");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "Organization_slug_idx" ON "Organization" USING btree ("slug");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Organization_stripe_customer_idx" ON "Organization" USING btree ("stripeCustomerId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "OrganizationApiKey_org_id_idx" ON "OrganizationApiKey" USING btree ("organizationId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "OrganizationApiKey_key_prefix_idx" ON "OrganizationApiKey" USING btree ("keyPrefix");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "OrganizationLifeInstance_org_id_idx" ON "OrganizationLifeInstance" USING btree ("organizationId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "OrganizationMember_org_id_idx" ON "OrganizationMember" USING btree ("organizationId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "OrganizationMember_user_id_idx" ON "OrganizationMember" USING btree ("userId");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "OrganizationMember_org_user_unique" ON "OrganizationMember" USING btree ("organizationId","userId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "UsageEvent_org_id_idx" ON "UsageEvent" USING btree ("organizationId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "UsageEvent_user_id_idx" ON "UsageEvent" USING btree ("userId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "UsageEvent_created_at_idx" ON "UsageEvent" USING btree ("createdAt");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "UsageEvent_org_created_idx" ON "UsageEvent" USING btree ("organizationId","createdAt");
--> statement-breakpoint
-- Ensure all Organization columns exist if table was created by an earlier schema push
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "planCreditsMonthly" integer NOT NULL DEFAULT 50;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "planCreditsRemaining" integer NOT NULL DEFAULT 50;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "billingPeriodStart" timestamp;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "neonBranchId" varchar(256);
