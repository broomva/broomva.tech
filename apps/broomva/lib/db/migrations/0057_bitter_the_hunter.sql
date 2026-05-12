ALTER TABLE "UserPrompt" ADD COLUMN "copyCount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "UserPrompt" ADD COLUMN "isHighlighted" boolean DEFAULT false NOT NULL;