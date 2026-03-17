CREATE TABLE IF NOT EXISTS "UserModelPreference" (
	"userId" text NOT NULL,
	"modelId" varchar(256) NOT NULL,
	"enabled" boolean NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "UserModelPreference_userId_modelId_pk" PRIMARY KEY("userId","modelId")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "UserModelPreference" ADD CONSTRAINT "UserModelPreference_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "UserModelPreference_user_id_idx" ON "UserModelPreference" USING btree ("userId");