CREATE TABLE IF NOT EXISTS "Part" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"messageId" uuid NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"type" varchar NOT NULL,
	"text_text" text,
	"reasoning_text" text,
	"file_mediaType" varchar,
	"file_filename" varchar,
	"file_url" varchar,
	"source_url_sourceId" varchar,
	"source_url_url" varchar,
	"source_url_title" varchar,
	"source_document_sourceId" varchar,
	"source_document_mediaType" varchar,
	"source_document_title" varchar,
	"source_document_filename" varchar,
	"tool_name" varchar,
	"tool_toolCallId" varchar,
	"tool_state" varchar,
	"tool_input" json,
	"tool_output" json,
	"tool_errorText" varchar,
	"data_type" varchar,
	"data_blob" json,
	"providerMetadata" json
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Part" ADD CONSTRAINT "Part_messageId_Message_id_fk" FOREIGN KEY ("messageId") REFERENCES "public"."Message"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Part_message_id_idx" ON "Part" USING btree ("messageId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Part_message_id_order_idx" ON "Part" USING btree ("messageId","order");