CREATE TABLE "AgentRegistration" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizationId" uuid,
	"name" varchar(256) NOT NULL,
	"description" text,
	"version" varchar(64),
	"sourceUrl" varchar(512),
	"capabilities" json DEFAULT '[]'::json,
	"trustScore" integer,
	"trustLevel" varchar DEFAULT 'unrated' NOT NULL,
	"lastEvaluatedAt" timestamp,
	"credentialId" varchar(256),
	"status" varchar DEFAULT 'pending' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "AgentRegistration" ADD CONSTRAINT "AgentRegistration_organizationId_Organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "AgentRegistration_org_id_idx" ON "AgentRegistration" USING btree ("organizationId");--> statement-breakpoint
CREATE INDEX "AgentRegistration_trust_level_idx" ON "AgentRegistration" USING btree ("trustLevel");--> statement-breakpoint
CREATE INDEX "AgentRegistration_status_idx" ON "AgentRegistration" USING btree ("status");