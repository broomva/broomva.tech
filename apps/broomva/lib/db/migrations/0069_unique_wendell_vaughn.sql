CREATE TABLE "SpecDoc" (
	"id" text PRIMARY KEY NOT NULL,
	"ownerId" text NOT NULL,
	"title" text NOT NULL,
	"html" text NOT NULL,
	"sourceRepo" text,
	"sourcePath" text,
	"sourceCommit" varchar(64),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "SpecDoc" ADD CONSTRAINT "SpecDoc_ownerId_user_id_fk" FOREIGN KEY ("ownerId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "SpecDoc_owner_created_idx" ON "SpecDoc" USING btree ("ownerId","createdAt");