ALTER TABLE "Project" ADD COLUMN "icon" varchar(64) DEFAULT 'folder' NOT NULL;--> statement-breakpoint
ALTER TABLE "Project" ADD COLUMN "iconColor" varchar(32) DEFAULT 'gray' NOT NULL;