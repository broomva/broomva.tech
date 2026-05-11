CREATE TYPE "prompt_feedback_signal" AS ENUM ('thumbs_up', 'thumbs_down');

CREATE TABLE IF NOT EXISTS "PromptFeedback" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "invocationId" uuid REFERENCES "PromptInvocation"("id") ON DELETE SET NULL,
  "promptSlug" varchar(256) NOT NULL,
  "promptVersion" varchar(32) NOT NULL,
  "userId" text REFERENCES "user"("id") ON DELETE SET NULL,
  "signal" "prompt_feedback_signal" NOT NULL,
  "text" text,
  "source" "prompt_invocation_source" NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "prompt_feedback_text_length" CHECK (char_length("text") <= 2000)
);

CREATE INDEX IF NOT EXISTS "PromptFeedback_slug_created_idx"
  ON "PromptFeedback" ("promptSlug", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "PromptFeedback_invocation_idx"
  ON "PromptFeedback" ("invocationId")
  WHERE "invocationId" IS NOT NULL;
