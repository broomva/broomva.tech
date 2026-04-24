ALTER TABLE "LifeSession" ADD COLUMN "chatId" uuid;--> statement-breakpoint
ALTER TABLE "LifeSession" ADD CONSTRAINT "LifeSession_chatId_Chat_id_fk" FOREIGN KEY ("chatId") REFERENCES "public"."Chat"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "LifeSession_chat_idx" ON "LifeSession" USING btree ("chatId");