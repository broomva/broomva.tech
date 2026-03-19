CREATE TABLE IF NOT EXISTS "DeviceAuthCode" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "deviceCode" varchar(64) NOT NULL UNIQUE,
  "userCode" varchar(12) NOT NULL UNIQUE,
  "scope" text NOT NULL DEFAULT '',
  "clientId" varchar(128) NOT NULL DEFAULT 'cli',
  "status" varchar(16) NOT NULL DEFAULT 'pending',
  "userId" text REFERENCES "user"("id") ON DELETE CASCADE,
  "sessionToken" text,
  "expiresAt" timestamp NOT NULL,
  "pollingInterval" integer NOT NULL DEFAULT 5,
  "createdAt" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "DeviceAuthCode_device_code_idx" ON "DeviceAuthCode" ("deviceCode");
CREATE INDEX IF NOT EXISTS "DeviceAuthCode_user_code_idx" ON "DeviceAuthCode" ("userCode");
