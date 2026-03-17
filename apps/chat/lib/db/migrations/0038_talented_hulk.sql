ALTER TABLE "UserCredit" ALTER COLUMN "credits" SET DEFAULT 50;--> statement-breakpoint
ALTER TABLE "UserCredit" DROP COLUMN IF EXISTS "reservedCredits";