CREATE TABLE "LifeByokKey" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ownerKind" varchar(16) NOT NULL,
	"ownerId" varchar(256) NOT NULL,
	"provider" varchar(32) NOT NULL,
	"label" varchar(128) NOT NULL,
	"encryptedPayload" text NOT NULL,
	"keyHint" varchar(16),
	"scope" varchar(32) DEFAULT 'internal' NOT NULL,
	"status" varchar(32) DEFAULT 'active' NOT NULL,
	"lastUsedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "LifeModuleType" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"version" varchar(32) NOT NULL,
	"displayName" varchar(256) NOT NULL,
	"description" text,
	"runnerRef" varchar(128) NOT NULL,
	"inputSchema" json NOT NULL,
	"outputSchema" json NOT NULL,
	"requiredTools" json DEFAULT '[]'::jsonb NOT NULL,
	"defaultUi" varchar(128) DEFAULT 'life-interface-classic' NOT NULL,
	"costEstimateCents" json DEFAULT '{"avg":10,"p95":30}'::jsonb NOT NULL,
	"status" varchar(32) DEFAULT 'active' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "LifeProject" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(128) NOT NULL,
	"displayName" varchar(256) NOT NULL,
	"description" text,
	"ownerKind" varchar(16) NOT NULL,
	"ownerId" varchar(256) NOT NULL,
	"moduleTypeId" varchar(128) NOT NULL,
	"currentRulesVersionId" uuid,
	"visibility" varchar(32) DEFAULT 'private' NOT NULL,
	"pricing" json,
	"secretsMode" varchar(32) DEFAULT 'platform' NOT NULL,
	"status" varchar(32) DEFAULT 'draft' NOT NULL,
	"safetyFlags" json DEFAULT '{}'::jsonb NOT NULL,
	"stats" json DEFAULT '{}'::jsonb NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "LifeProject_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "LifeReservedSlug" (
	"slug" varchar(64) PRIMARY KEY NOT NULL,
	"reason" varchar(128) DEFAULT 'platform-reserved' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "LifeRulesVersion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"projectId" uuid NOT NULL,
	"rulesJson" json NOT NULL,
	"semver" varchar(32) NOT NULL,
	"parentId" uuid,
	"createdByUserId" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "LifeRun" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"projectId" uuid NOT NULL,
	"rulesVersionId" uuid NOT NULL,
	"consumerKind" varchar(16) NOT NULL,
	"consumerId" varchar(256) NOT NULL,
	"organizationId" uuid,
	"input" json NOT NULL,
	"output" json,
	"status" varchar(32) DEFAULT 'queued' NOT NULL,
	"errorReason" text,
	"llmCostCents" integer DEFAULT 0 NOT NULL,
	"platformFeeCents" integer DEFAULT 0 NOT NULL,
	"creatorFeeCents" integer DEFAULT 0 NOT NULL,
	"consumerPaidCents" integer DEFAULT 0 NOT NULL,
	"paymentMode" varchar(32) DEFAULT 'credits' NOT NULL,
	"paymentRail" varchar(32),
	"paymentTxId" varchar(256),
	"model" varchar(128),
	"provider" varchar(32),
	"byokKeyId" uuid,
	"startedAt" timestamp,
	"finishedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "LifeRunEvent" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "LifeRunEvent_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"runId" uuid NOT NULL,
	"seq" integer NOT NULL,
	"type" varchar(64) NOT NULL,
	"payload" json DEFAULT '{}'::jsonb NOT NULL,
	"at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "LifeProject" ADD CONSTRAINT "LifeProject_moduleTypeId_LifeModuleType_id_fk" FOREIGN KEY ("moduleTypeId") REFERENCES "public"."LifeModuleType"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "LifeRulesVersion" ADD CONSTRAINT "LifeRulesVersion_projectId_LifeProject_id_fk" FOREIGN KEY ("projectId") REFERENCES "public"."LifeProject"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "LifeRulesVersion" ADD CONSTRAINT "LifeRulesVersion_parentId_fk" FOREIGN KEY ("parentId") REFERENCES "public"."LifeRulesVersion"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "LifeRun" ADD CONSTRAINT "LifeRun_projectId_LifeProject_id_fk" FOREIGN KEY ("projectId") REFERENCES "public"."LifeProject"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "LifeRun" ADD CONSTRAINT "LifeRun_rulesVersionId_LifeRulesVersion_id_fk" FOREIGN KEY ("rulesVersionId") REFERENCES "public"."LifeRulesVersion"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "LifeRun" ADD CONSTRAINT "LifeRun_organizationId_Organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "LifeRun" ADD CONSTRAINT "LifeRun_byokKeyId_LifeByokKey_id_fk" FOREIGN KEY ("byokKeyId") REFERENCES "public"."LifeByokKey"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "LifeRunEvent" ADD CONSTRAINT "LifeRunEvent_runId_LifeRun_id_fk" FOREIGN KEY ("runId") REFERENCES "public"."LifeRun"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "LifeByokKey_owner_idx" ON "LifeByokKey" USING btree ("ownerKind","ownerId","status");--> statement-breakpoint
CREATE INDEX "LifeProject_owner_idx" ON "LifeProject" USING btree ("ownerKind","ownerId");--> statement-breakpoint
CREATE INDEX "LifeProject_visibility_idx" ON "LifeProject" USING btree ("visibility","status");--> statement-breakpoint
CREATE INDEX "LifeProject_module_idx" ON "LifeProject" USING btree ("moduleTypeId");--> statement-breakpoint
CREATE INDEX "LifeRulesVersion_project_idx" ON "LifeRulesVersion" USING btree ("projectId","createdAt");--> statement-breakpoint
CREATE INDEX "LifeRun_project_idx" ON "LifeRun" USING btree ("projectId","createdAt");--> statement-breakpoint
CREATE INDEX "LifeRun_consumer_idx" ON "LifeRun" USING btree ("consumerKind","consumerId");--> statement-breakpoint
CREATE INDEX "LifeRun_status_idx" ON "LifeRun" USING btree ("status");--> statement-breakpoint
CREATE INDEX "LifeRun_org_idx" ON "LifeRun" USING btree ("organizationId");--> statement-breakpoint
CREATE UNIQUE INDEX "LifeRunEvent_run_seq_uq" ON "LifeRunEvent" USING btree ("runId","seq");