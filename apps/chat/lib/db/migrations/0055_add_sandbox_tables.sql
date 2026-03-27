-- BRO-261: Sandbox management tables
-- SandboxInstance: live state of a sandbox execution environment
-- SandboxSnapshot: point-in-time filesystem snapshots

CREATE TABLE IF NOT EXISTS "SandboxInstance" (
  "id"             uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" uuid REFERENCES "Organization"("id") ON DELETE CASCADE,
  "agentId"        uuid REFERENCES "AgentRegistration"("id") ON DELETE SET NULL,
  "sandboxId"      varchar(256) NOT NULL UNIQUE,
  "sessionId"      varchar(256),
  "provider"       varchar(32) NOT NULL,
  "status"         varchar(32) NOT NULL DEFAULT 'starting',
  "vcpus"          integer,
  "memoryMb"       integer,
  "persistent"     boolean NOT NULL DEFAULT false,
  "lastExecAt"     timestamp,
  "execCount"      integer NOT NULL DEFAULT 0,
  "createdAt"      timestamp NOT NULL DEFAULT now(),
  "updatedAt"      timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "SandboxInstance_org_idx"      ON "SandboxInstance"("organizationId");
CREATE INDEX IF NOT EXISTS "SandboxInstance_agent_idx"    ON "SandboxInstance"("agentId");
CREATE INDEX IF NOT EXISTS "SandboxInstance_status_idx"   ON "SandboxInstance"("status");
CREATE INDEX IF NOT EXISTS "SandboxInstance_provider_idx" ON "SandboxInstance"("provider");

CREATE TABLE IF NOT EXISTS "SandboxSnapshot" (
  "id"                uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  "sandboxInstanceId" uuid NOT NULL REFERENCES "SandboxInstance"("id") ON DELETE CASCADE,
  "snapshotId"        varchar(256) NOT NULL,
  "trigger"           varchar(32) NOT NULL,
  "sizeBytes"         integer,
  "createdAt"         timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "SandboxSnapshot_instance_idx" ON "SandboxSnapshot"("sandboxInstanceId");
