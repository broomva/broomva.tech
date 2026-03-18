CREATE TABLE "UserPrompt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" text NOT NULL,
	"title" varchar(256) NOT NULL,
	"content" text NOT NULL,
	"summary" text,
	"category" varchar(128),
	"model" varchar(128),
	"version" varchar(32),
	"tags" json DEFAULT '[]'::json,
	"variables" json,
	"visibility" varchar DEFAULT 'private' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "UserPrompt" ADD CONSTRAINT "UserPrompt_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "UserPrompt_user_id_idx" ON "UserPrompt" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "UserPrompt_visibility_idx" ON "UserPrompt" USING btree ("visibility");--> statement-breakpoint
ALTER TABLE "Part" ADD CONSTRAINT "Part_text_required_if_type_text" CHECK (CASE WHEN "Part"."type" = 'text' THEN "Part"."text_text" IS NOT NULL ELSE TRUE END);--> statement-breakpoint
ALTER TABLE "Part" ADD CONSTRAINT "Part_reasoning_required_if_type_reasoning" CHECK (CASE WHEN "Part"."type" = 'reasoning' THEN "Part"."reasoning_text" IS NOT NULL ELSE TRUE END);--> statement-breakpoint
ALTER TABLE "Part" ADD CONSTRAINT "Part_file_required_if_type_file" CHECK (CASE WHEN "Part"."type" = 'file' THEN "Part"."file_mediaType" IS NOT NULL AND "Part"."file_url" IS NOT NULL ELSE TRUE END);--> statement-breakpoint
ALTER TABLE "Part" ADD CONSTRAINT "Part_source_url_required_if_type_source_url" CHECK (CASE WHEN "Part"."type" = 'source-url' THEN "Part"."source_url_sourceId" IS NOT NULL AND "Part"."source_url_url" IS NOT NULL ELSE TRUE END);--> statement-breakpoint
ALTER TABLE "Part" ADD CONSTRAINT "Part_source_document_required_if_type_source_document" CHECK (CASE WHEN "Part"."type" = 'source-document' THEN "Part"."source_document_sourceId" IS NOT NULL AND "Part"."source_document_mediaType" IS NOT NULL AND "Part"."source_document_title" IS NOT NULL ELSE TRUE END);--> statement-breakpoint
ALTER TABLE "Part" ADD CONSTRAINT "Part_tool_required_if_type_tool" CHECK (CASE WHEN "Part"."type" LIKE 'tool-%' THEN "Part"."tool_toolCallId" IS NOT NULL AND "Part"."tool_state" IS NOT NULL ELSE TRUE END);--> statement-breakpoint
ALTER TABLE "Part" ADD CONSTRAINT "Part_data_required_if_type_data" CHECK (CASE WHEN "Part"."type" LIKE 'data-%' THEN "Part"."data_type" IS NOT NULL ELSE TRUE END);