CREATE TABLE "DeviceAuthCode" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deviceCode" varchar(64) NOT NULL,
	"userCode" varchar(12) NOT NULL,
	"scope" text DEFAULT '' NOT NULL,
	"clientId" varchar(128) DEFAULT 'cli' NOT NULL,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"userId" text,
	"sessionToken" text,
	"expiresAt" timestamp NOT NULL,
	"pollingInterval" integer DEFAULT 5 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "DeviceAuthCode_deviceCode_unique" UNIQUE("deviceCode"),
	CONSTRAINT "DeviceAuthCode_userCode_unique" UNIQUE("userCode")
);
--> statement-breakpoint
CREATE TABLE "UserVault" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" text NOT NULL,
	"lagoSessionId" varchar(32) NOT NULL,
	"name" varchar(256) DEFAULT 'default' NOT NULL,
	"isPrimary" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "UserPrompt" ADD COLUMN "slug" varchar(256) NOT NULL;--> statement-breakpoint
ALTER TABLE "UserPrompt" ADD COLUMN "links" json;--> statement-breakpoint
ALTER TABLE "UserPrompt" ADD COLUMN "deletedAt" timestamp;--> statement-breakpoint
ALTER TABLE "DeviceAuthCode" ADD CONSTRAINT "DeviceAuthCode_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "UserVault" ADD CONSTRAINT "UserVault_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "DeviceAuthCode_device_code_idx" ON "DeviceAuthCode" USING btree ("deviceCode");--> statement-breakpoint
CREATE INDEX "DeviceAuthCode_user_code_idx" ON "DeviceAuthCode" USING btree ("userCode");--> statement-breakpoint
CREATE INDEX "UserVault_user_id_idx" ON "UserVault" USING btree ("userId");--> statement-breakpoint
CREATE UNIQUE INDEX "UserVault_lago_session_unique" ON "UserVault" USING btree ("lagoSessionId");--> statement-breakpoint
CREATE UNIQUE INDEX "UserPrompt_slug_unique" ON "UserPrompt" USING btree ("slug");