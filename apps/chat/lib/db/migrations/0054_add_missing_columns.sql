-- Safety net: add columns that may be missing when OrganizationMember or
-- other tables were created via drizzle-kit push before these columns
-- existed in the schema (migration 0048 uses CREATE TABLE IF NOT EXISTS
-- which skips the table if it already exists, leaving pre-existing tables
-- missing any columns added after the initial push).

-- OrganizationMember: invitedAt was added after the table was first created
ALTER TABLE "OrganizationMember" ADD COLUMN IF NOT EXISTS "invitedAt" timestamp;

-- Organization: ensure all billing columns exist (belt-and-suspenders over 0048)
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "planCreditsMonthly" integer NOT NULL DEFAULT 50;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "planCreditsRemaining" integer NOT NULL DEFAULT 50;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "billingPeriodStart" timestamp;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "neonBranchId" varchar(256);
