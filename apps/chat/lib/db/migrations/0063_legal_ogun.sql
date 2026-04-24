CREATE TABLE "LifeProjectFile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"projectId" uuid NOT NULL,
	"path" varchar(1024) NOT NULL,
	"blobSha" varchar(64) NOT NULL,
	"blobUrl" text NOT NULL,
	"sizeBytes" integer NOT NULL,
	"mime" varchar(128),
	"writtenBy" varchar(256) NOT NULL,
	"sessionId" uuid,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "LifeRunSnapshot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sessionId" uuid NOT NULL,
	"runId" uuid NOT NULL,
	"atEventSeq" integer NOT NULL,
	"sceneJson" json NOT NULL,
	"signalsJson" json DEFAULT '{}'::jsonb NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "LifeSessionFile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sessionId" uuid NOT NULL,
	"path" varchar(1024) NOT NULL,
	"blobSha" varchar(64) NOT NULL,
	"blobUrl" text NOT NULL,
	"sizeBytes" integer NOT NULL,
	"mime" varchar(128),
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "LifeProjectFile" ADD CONSTRAINT "LifeProjectFile_projectId_LifeProject_id_fk" FOREIGN KEY ("projectId") REFERENCES "public"."LifeProject"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "LifeProjectFile" ADD CONSTRAINT "LifeProjectFile_sessionId_LifeSession_id_fk" FOREIGN KEY ("sessionId") REFERENCES "public"."LifeSession"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "LifeRunSnapshot" ADD CONSTRAINT "LifeRunSnapshot_sessionId_LifeSession_id_fk" FOREIGN KEY ("sessionId") REFERENCES "public"."LifeSession"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "LifeRunSnapshot" ADD CONSTRAINT "LifeRunSnapshot_runId_LifeRun_id_fk" FOREIGN KEY ("runId") REFERENCES "public"."LifeRun"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "LifeSessionFile" ADD CONSTRAINT "LifeSessionFile_sessionId_LifeSession_id_fk" FOREIGN KEY ("sessionId") REFERENCES "public"."LifeSession"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "LifeProjectFile_project_path_uq" ON "LifeProjectFile" USING btree ("projectId","path");--> statement-breakpoint
CREATE INDEX "LifeProjectFile_written_by_idx" ON "LifeProjectFile" USING btree ("writtenBy");--> statement-breakpoint
CREATE INDEX "LifeRunSnapshot_session_seq_idx" ON "LifeRunSnapshot" USING btree ("sessionId","atEventSeq");--> statement-breakpoint
CREATE UNIQUE INDEX "LifeSessionFile_session_path_uq" ON "LifeSessionFile" USING btree ("sessionId","path");