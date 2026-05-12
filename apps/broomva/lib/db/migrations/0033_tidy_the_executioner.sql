CREATE TABLE IF NOT EXISTS "McpConnector" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" text,
	"name" varchar(256) NOT NULL,
	"url" text NOT NULL,
	"type" varchar DEFAULT 'http' NOT NULL,
	"oauthClientId" text,
	"oauthClientSecret" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "McpConnector" ADD CONSTRAINT "McpConnector_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "McpConnector_user_id_idx" ON "McpConnector" USING btree ("userId");