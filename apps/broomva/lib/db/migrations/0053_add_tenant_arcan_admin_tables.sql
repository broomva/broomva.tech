-- BRO-228: Tenant admin portal tables
-- OrganizationArcanRole: per-org Arcan capability overrides per role
-- OrganizationCustomSkill: custom SKILL.md manifests uploaded by org admins
-- OrganizationMcpServer: private MCP servers registered by enterprise org admins

CREATE TABLE IF NOT EXISTS "OrganizationArcanRole" (
  "id" uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" uuid NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE,
  "roleName" varchar(128) NOT NULL,
  "allowCapabilities" json NOT NULL DEFAULT '[]'::json,
  "maxEventsPerTurn" integer NOT NULL DEFAULT 20,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "OrgArcanRole_org_idx" ON "OrganizationArcanRole"("organizationId");
CREATE UNIQUE INDEX IF NOT EXISTS "OrgArcanRole_org_role_unique" ON "OrganizationArcanRole"("organizationId", "roleName");

CREATE TABLE IF NOT EXISTS "OrganizationCustomSkill" (
  "id" uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" uuid NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE,
  "name" varchar(256) NOT NULL,
  "manifestToml" text NOT NULL,
  "assignedRoles" json NOT NULL DEFAULT '[]'::json,
  "enabled" boolean NOT NULL DEFAULT true,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "OrgCustomSkill_org_idx" ON "OrganizationCustomSkill"("organizationId");
CREATE UNIQUE INDEX IF NOT EXISTS "OrgCustomSkill_org_name_unique" ON "OrganizationCustomSkill"("organizationId", "name");

CREATE TABLE IF NOT EXISTS "OrganizationMcpServer" (
  "id" uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" uuid NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE,
  "name" varchar(256) NOT NULL,
  "url" text NOT NULL,
  "bearerToken" text,
  "assignedRoles" json NOT NULL DEFAULT '[]'::json,
  "enabled" boolean NOT NULL DEFAULT true,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "OrgMcpServer_org_idx" ON "OrganizationMcpServer"("organizationId");
CREATE UNIQUE INDEX IF NOT EXISTS "OrgMcpServer_org_name_unique" ON "OrganizationMcpServer"("organizationId", "name");
