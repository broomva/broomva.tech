CREATE TABLE IF NOT EXISTS "McpOAuthSession" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mcpConnectorId" uuid NOT NULL,
	"serverUrl" text NOT NULL,
	"clientInfo" json,
	"tokens" json,
	"codeVerifier" text,
	"state" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "McpOAuthSession_state_unique" UNIQUE("state")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "McpOAuthSession" ADD CONSTRAINT "McpOAuthSession_mcpConnectorId_McpConnector_id_fk" FOREIGN KEY ("mcpConnectorId") REFERENCES "public"."McpConnector"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "McpOAuthSession_connector_idx" ON "McpOAuthSession" USING btree ("mcpConnectorId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "McpOAuthSession_state_idx" ON "McpOAuthSession" USING btree ("state");