import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import chatConfig from "../chat.config";
import { PRIVACY_CONTENT_SHA256, TERMS_CONTENT_SHA256 } from "./legal";

function policyManifestHash(policyPath: string) {
  const policySource = readFileSync(resolve(process.cwd(), policyPath), "utf8");
  const policyKey = policyPath.includes("terms") ? "terms" : "privacy";
  const materialConfig = JSON.stringify({
    appName: chatConfig.appName,
    appUrl: chatConfig.appUrl,
    organization: chatConfig.organization,
    legal: chatConfig.legal,
    policy: chatConfig.policies[policyKey],
  });

  return createHash("sha256")
    .update(policySource)
    .update("\n--- legally material config ---\n")
    .update(materialConfig)
    .digest("hex");
}

describe("legal policy evidence", () => {
  it("requires a new Terms hash when rendered policy inputs change", () => {
    expect(policyManifestHash("app/terms/page.tsx")).toBe(TERMS_CONTENT_SHA256);
  });

  it("requires a new Privacy hash when rendered policy inputs change", () => {
    expect(policyManifestHash("app/privacy/page.tsx")).toBe(
      PRIVACY_CONTENT_SHA256,
    );
  });

  it("keeps receipt time unambiguous and version-only reacceptance possible", () => {
    const migration = readFileSync(
      resolve(process.cwd(), "lib/db/migrations/0079_slow_newton_destine.sql"),
      "utf8",
    );

    expect(migration).toContain(
      '"acceptedAt" timestamp with time zone DEFAULT now() NOT NULL',
    );
    expect(migration).toContain(
      '("userId","termsVersion","privacyVersion","termsHash","privacyHash","source")',
    );
  });
  it("records legal acceptance with the trusted client IP", () => {
    const registrationActions = readFileSync(
      resolve(process.cwd(), "app/(auth)/register/actions.ts"),
      "utf8",
    );
    const acceptanceActions = readFileSync(
      resolve(process.cwd(), "app/legal-acceptance/actions.ts"),
      "utf8",
    );

    expect(registrationActions).toContain("getTrustedClientIPFromHeaders");
    expect(acceptanceActions).toContain("getTrustedClientIPFromHeaders");
  });
});
