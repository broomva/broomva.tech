ALTER TABLE "Message" ADD COLUMN "canceledAt" timestamp;--> statement-breakpoint
ALTER TABLE "Chat" DROP COLUMN IF EXISTS "canceledAt";