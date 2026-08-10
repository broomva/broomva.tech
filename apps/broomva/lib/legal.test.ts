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

  it("keeps public Life routes from reviving anonymous prompt/state access", () => {
    const runRoute = readFileSync(
      resolve(
        process.cwd(),
        "app/api/life/run/[project]/prosopon/route.ts",
      ),
      "utf8",
    );
    const stateRoute = readFileSync(
      resolve(
        process.cwd(),
        "app/api/life/run/[project]/session/[sessionId]/state/route.ts",
      ),
      "utf8",
    );
    const legalAccess = readFileSync(
      resolve(process.cwd(), "lib/life-runtime/legal-access.ts"),
      "utf8",
    );
    const chatRouter = readFileSync(
      resolve(process.cwd(), "trpc/routers/chat.router.ts"),
      "utf8",
    );
    const onboardingActions = readFileSync(
      resolve(process.cwd(), "app/(auth)/onboarding/actions.ts"),
      "utf8",
    );
    const mcpQueries = readFileSync(
      resolve(process.cwd(), "lib/db/mcp-queries.ts"),
      "utf8",
    );
    const registrationActions = readFileSync(
      resolve(process.cwd(), "app/(auth)/register/actions.ts"),
      "utf8",
    );
    const acceptanceActions = readFileSync(
      resolve(process.cwd(), "app/legal-acceptance/actions.ts"),
      "utf8",
    );

    expect(runRoute).not.toContain('kind: "agent", id: "anonymous"');
    expect(runRoute).toContain("resolveAcceptedLifeConsumer");
    expect(stateRoute).toContain("callerOwnsLifeSession");
    expect(legalAccess).toContain("hasCurrentLegalAcceptance");
    expect(legalAccess).toMatch(/every non-user legacy session fails closed\.\s*return false;/);
    expect(chatRouter).toMatch(/generateTitle:\s*protectedProcedure/);
    expect(onboardingActions.match(/requireCurrentLegalAcceptance/g)).toHaveLength(3);
    expect(mcpQueries.startsWith('import "server-only";')).toBe(true);
    expect(mcpQueries).not.toContain('"use server"');
    expect(registrationActions).toContain("getTrustedClientIPFromHeaders");
    expect(acceptanceActions).toContain("getTrustedClientIPFromHeaders");
  });
});
