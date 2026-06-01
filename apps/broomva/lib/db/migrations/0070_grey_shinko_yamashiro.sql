CREATE TABLE "base_account" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"address" text NOT NULL,
	"chain_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"verified_at" timestamp NOT NULL,
	CONSTRAINT "base_account_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "base_auth_nonce" (
	"nonce" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "base_account" ADD CONSTRAINT "base_account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "base_auth_nonce" ADD CONSTRAINT "base_auth_nonce_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;