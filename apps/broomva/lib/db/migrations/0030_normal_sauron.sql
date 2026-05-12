ALTER TABLE "Document" RENAME COLUMN "text" TO "kind";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Document_message_id_idx" ON "Document" USING btree ("messageId");