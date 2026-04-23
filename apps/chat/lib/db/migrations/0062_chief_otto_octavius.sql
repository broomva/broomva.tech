CREATE TABLE "LifeSession" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"projectId" uuid NOT NULL,
	"consumerKind" varchar(16) NOT NULL,
	"consumerId" varchar(256) NOT NULL,
	"organizationId" uuid,
	"title" varchar(256),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "LifeRun" ADD COLUMN "sessionId" uuid;--> statement-breakpoint
ALTER TABLE "LifeRun" ADD COLUMN "inputText" text;--> statement-breakpoint
ALTER TABLE "LifeSession" ADD CONSTRAINT "LifeSession_projectId_LifeProject_id_fk" FOREIGN KEY ("projectId") REFERENCES "public"."LifeProject"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "LifeSession" ADD CONSTRAINT "LifeSession_organizationId_Organization_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "LifeSession_project_idx" ON "LifeSession" USING btree ("projectId","updatedAt");--> statement-breakpoint
CREATE INDEX "LifeSession_consumer_idx" ON "LifeSession" USING btree ("consumerKind","consumerId");--> statement-breakpoint
ALTER TABLE "LifeRun" ADD CONSTRAINT "LifeRun_sessionId_LifeSession_id_fk" FOREIGN KEY ("sessionId") REFERENCES "public"."LifeSession"("id") ON DELETE cascade ON UPDATE no action;