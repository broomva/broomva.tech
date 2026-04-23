#!/usr/bin/env bun
/**
 * Smoke test for @broomva/life-modules-core.
 * Loads the existing Exclusive Rentals rules-package, renders the system
 * prompt through liquid, and renders a tiny HTML report to stdout (first 400 chars).
 * No LLM calls. No env vars required.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadRulesPackage, renderPrompt, renderReport } from "../src/index.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const tenantRulesDir = path.resolve(
  here,
  "../../../../freelance/exclusive-rentals/rules-package",
);

async function main() {
  console.log("→ Loading rules package:", tenantRulesDir);
  const pkg = await loadRulesPackage(tenantRulesDir);
  console.log("  manifest:", JSON.stringify(pkg.manifest, null, 2));
  console.log("  rules/ keys:", Object.keys(pkg.rules));
  console.log("  prompts/ keys:", Object.keys(pkg.prompts));
  console.log("  schemas/ keys:", Object.keys(pkg.schemas));

  const sysTemplate = pkg.prompts.system ?? "You are {{ tenant.name }} auditor.";
  const rendered = await renderPrompt(sysTemplate, {
    rules: { ...pkg.rules, taxonomy: pkg.taxonomy, sources: pkg.sources },
    tenant: {
      id: "exclusive-rentals",
      name: "Exclusive Rentals",
      locale: "en-CA",
      currency: "CAD",
      region: "London, ON",
    },
  });
  console.log("\n→ Rendered system prompt (first 240 chars):");
  console.log(rendered.slice(0, 240));

  const html = renderReport({
    tenant: {
      id: "exclusive-rentals",
      name: "Exclusive Rentals",
      locale: "en-CA",
      currency: "CAD",
      region: "London, ON",
    },
    title: "Smoke Test Report",
    subtitle: "Core package dry-run — no LLM calls.",
    sections: [
      {
        heading: "Checks",
        items: [
          {
            tag: "OK",
            tagTone: "success",
            title: "Rules package loaded",
            body: `Module: ${pkg.manifest.module}@${pkg.manifest.moduleVersion}, rulesVersion ${pkg.manifest.rulesVersion}.`,
          },
        ],
      },
    ],
    metadata: {
      runId: `smoke-${Date.now().toString(36)}`,
      runAt: new Date(),
      model: "n/a",
    },
    dataBanner: "Synthetic smoke-test output — not a real audit.",
  });

  console.log("\n→ Report HTML (first 400 chars):");
  console.log(html.slice(0, 400));
  console.log("\n✓ smoke OK");
}

main().catch((err) => {
  console.error("✗ smoke FAILED:", err);
  process.exit(1);
});
