CREATE TABLE "LegalAcceptance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" text NOT NULL,
	"termsVersion" text NOT NULL,
	"privacyVersion" text NOT NULL,
	"termsHash" text NOT NULL,
	"privacyHash" text NOT NULL,
	"deploymentId" text,
	"processingAuthorized" boolean NOT NULL,
	"ageConfirmed" boolean NOT NULL,
	"source" varchar NOT NULL,
	"acceptedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"ipAddress" text,
	"userAgent" text
);
--> statement-breakpoint
CREATE UNIQUE INDEX "LegalAcceptance_user_policy_source_unique" ON "LegalAcceptance" USING btree ("userId","termsVersion","privacyVersion","termsHash","privacyHash","source");--> statement-breakpoint
CREATE INDEX "LegalAcceptance_user_acceptedAt_idx" ON "LegalAcceptance" USING btree ("userId","acceptedAt");
