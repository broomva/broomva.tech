CREATE TABLE "AudioPlaybackState" (
	"userId" text PRIMARY KEY NOT NULL,
	"audioSrc" text NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"currentTime" integer DEFAULT 0 NOT NULL,
	"duration" integer DEFAULT 0 NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "AudioPlaybackState" ADD CONSTRAINT "AudioPlaybackState_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;