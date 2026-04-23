#!/usr/bin/env bun
/**
 * Sentinel audit CLI.
 *
 *   bun run audit \
 *     --rules    <path to tenant rules-package>
 *     --fixtures <path to WO fixtures dir or file>
 *     --report   <path to output HTML>
 *     [--no-llm]                  skip the LLM pass (stage A only)
 *     [--model claude-sonnet-4-5] override the LLM model
 *     [--json <out.json>]         override JSON output path
 *
 * Writes:
 *   - <report>                    self-contained HTML audit report
 *   - <json> (default: alongside report as audit-result.json)
 *
 * Terminal output is coloured and structured so an asciinema capture
 * reads clearly in the demo video.
 */

import path from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import {
  loadRulesPackage,
  renderReport,
  type ReportItem,
  type ReportSection,
  type TenantContext,
} from "@broomva/life-modules-core";
import { audit } from "../src/audit.ts";
import { WorkOrderSchema, type AuditAlert, type WorkOrder } from "../src/types.ts";
import { z } from "zod";

// ---------- pacing ----------
const DEMO_PACE_MS = (() => {
  const raw = process.env.SENTINEL_DEMO_PACE;
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
})();

async function beat(ms: number = DEMO_PACE_MS): Promise<void> {
  if (ms <= 0) return;
  await new Promise<void>((r) => setTimeout(r, ms));
}

// ---------- ansi ----------
const C = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
};
const p = {
  dim: (s: string) => `${C.dim}${s}${C.reset}`,
  bold: (s: string) => `${C.bold}${s}${C.reset}`,
  red: (s: string) => `${C.red}${s}${C.reset}`,
  green: (s: string) => `${C.green}${s}${C.reset}`,
  yellow: (s: string) => `${C.yellow}${s}${C.reset}`,
  cyan: (s: string) => `${C.cyan}${s}${C.reset}`,
  magenta: (s: string) => `${C.magenta}${s}${C.reset}`,
  gray: (s: string) => `${C.gray}${s}${C.reset}`,
};

// ---------- arg parse ----------
function parseArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      out[key] = true;
    } else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

function usage(): void {
  console.log(
    `\nsentinel-property-ops — work-order audit runner\n\n` +
      `usage:\n` +
      `  bun run audit --rules <dir> --fixtures <dir|file> --report <out.html> [--no-llm] [--model <id>] [--json <out.json>]\n`,
  );
}

// ---------- fixtures ----------
const WorkOrdersListSchema = z.array(WorkOrderSchema);

async function loadWorkOrders(fixturesArg: string): Promise<WorkOrder[]> {
  const abs = path.resolve(fixturesArg);
  if (!existsSync(abs)) {
    throw new Error(`fixtures not found: ${abs}`);
  }
  const resolved = abs.endsWith(".json")
    ? abs
    : path.join(abs, "work-orders.json");
  if (!existsSync(resolved)) {
    throw new Error(`fixtures file not found: ${resolved}`);
  }
  const raw = await Bun.file(resolved).text();
  const parsed = JSON.parse(raw);
  return WorkOrdersListSchema.parse(parsed);
}

// ---------- report shaping ----------
function severityTone(sev: AuditAlert["severity"]): ReportItem["tagTone"] {
  return sev === "high" ? "danger" : sev === "medium" ? "warning" : "info";
}

function alertShortLabel(a: AuditAlert): string {
  return a.relatedWoIds.join(" ↔ ");
}

function titleFor(a: AuditAlert): string {
  const head = a.type.replace(/_/g, " ");
  return `${head} — ${a.relatedWoIds[0]}${a.relatedWoIds.length > 1 ? ` + ${a.relatedWoIds.length - 1} more` : ""}`;
}

function buildSections(alerts: AuditAlert[], workOrders: WorkOrder[]): ReportSection[] {
  const order: AuditAlert["type"][] = [
    "DUPLICATE_WO",
    "WEAK_CLOSURE",
    "FOLLOW_UP_RISK",
    "MISSING_EVIDENCE",
  ];
  const sections: ReportSection[] = [];

  const byType = new Map<AuditAlert["type"], AuditAlert[]>();
  for (const a of alerts) {
    if (!byType.has(a.type)) byType.set(a.type, []);
    byType.get(a.type)!.push(a);
  }

  const woById = new Map(workOrders.map((w) => [w.id, w]));

  const typeHeadings: Record<AuditAlert["type"], string> = {
    DUPLICATE_WO: "Duplicate work orders",
    WEAK_CLOSURE: "Weak closures",
    FOLLOW_UP_RISK: "Follow-up risk",
    MISSING_EVIDENCE: "Missing evidence",
  };
  const typeIntros: Record<AuditAlert["type"], string> = {
    DUPLICATE_WO:
      "Two or more WOs opened on the same unit within a 14-day window with overlapping descriptions. Either the first closure failed to resolve the root cause, or the second ticket duplicates billing.",
    WEAK_CLOSURE:
      "Closures that do not meet Exclusive's resolution standard — either trivial placeholder text (\"done\", \"fixed\") or tenant-reported items not explicitly addressed (Brough Street pattern).",
    FOLLOW_UP_RISK:
      "Repeat-visit chains on the same unit where the most recent closure punts the problem forward without a scheduled follow-up (Richmond ceiling-tile pattern).",
    MISSING_EVIDENCE:
      "High-cost repairs in photo-required categories (plumbing / HVAC / structural / roofing / electrical) closed with zero photos. Exclusive's standard requires evidence.",
  };

  for (const t of order) {
    const bucket = byType.get(t);
    if (!bucket || bucket.length === 0) continue;
    const items: ReportItem[] = bucket.map((a) => {
      const facts: Array<[string, string | number]> = [
        ["Severity", a.severity.toUpperCase()],
        ["Source", a.source === "deterministic" ? "Rule pack (Stage A)" : "LLM classifier (Stage B)"],
        ["Related WOs", a.relatedWoIds.join(", ")],
      ];
      const firstWo = woById.get(a.relatedWoIds[0]);
      if (firstWo) {
        facts.push(["Property / Unit", `${firstWo.propertyId}${firstWo.unitId ? ` · ${firstWo.unitId}` : ""}`]);
        if (firstWo.vendorName) facts.push(["Vendor", firstWo.vendorName]);
        if (firstWo.category) facts.push(["Category", firstWo.category]);
      }
      if (a.suggestedAction) facts.push(["Suggested action", a.suggestedAction]);
      return {
        tag: a.type.replace(/_/g, " "),
        tagTone: severityTone(a.severity),
        title: titleFor(a),
        body: a.rationale,
        facts,
        confidence: a.confidence,
      };
    });
    sections.push({
      heading: `${typeHeadings[t]} · ${bucket.length}`,
      intro: typeIntros[t],
      items,
    });
  }

  if (sections.length === 0) {
    sections.push({
      heading: "No alerts",
      intro: "All work orders in this batch passed the audit.",
      items: [
        {
          tag: "Clean",
          tagTone: "success",
          title: "Nothing to flag",
          body: "Every WO in the batch met Exclusive's closure standard and no duplicate / follow-up patterns were detected.",
          confidence: 0.9,
        },
      ],
    });
  }

  return sections;
}

// ---------- terminal ----------
function printBanner(): void {
  console.log("");
  console.log(p.bold(p.cyan("━━━ SENTINEL · work-order audit ━━━")));
  console.log(p.dim("  Life Module · sentinel-property-ops@0.1.0"));
  console.log(p.dim("  Tenant: Exclusive Rentals (London, ON)"));
  console.log("");
}

function printAlertLine(a: AuditAlert): void {
  const icon =
    a.severity === "high" ? p.red("■") : a.severity === "medium" ? p.yellow("▲") : p.cyan("●");
  const type = p.bold(a.type.padEnd(16, " "));
  const src = a.source === "deterministic" ? p.dim("[rules]") : p.magenta("[ llm ]");
  console.log(
    `  ${icon} ${type} ${src} ${p.gray("·")} ${alertShortLabel(a)}`,
  );
  const rationale = a.rationale.length > 110 ? a.rationale.slice(0, 107) + "..." : a.rationale;
  console.log(`     ${p.gray(rationale)}`);
}

// ---------- main ----------
async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.rules || !args.fixtures || !args.report) {
    usage();
    if (!args.help) process.exit(2);
    process.exit(0);
  }

  const rulesDir = String(args.rules);
  const fixturesPath = String(args.fixtures);
  const reportPath = path.resolve(String(args.report));
  const reportDir = path.dirname(reportPath);
  if (!existsSync(reportDir)) mkdirSync(reportDir, { recursive: true });
  const jsonPath = args.json
    ? path.resolve(String(args.json))
    : path.join(reportDir, "audit-result.json");

  const skipLlm = args["no-llm"] === true;
  const modelOverride = typeof args.model === "string" ? args.model : undefined;

  printBanner();
  await beat(600);
  console.log(p.dim(`  rules:    ${rulesDir}`));
  await beat(150);
  console.log(p.dim(`  fixtures: ${fixturesPath}`));
  await beat(150);
  console.log(p.dim(`  report:   ${reportPath}`));
  console.log("");
  await beat(600);

  const t0 = Date.now();

  const rulesPackage = await loadRulesPackage(rulesDir);
  const workOrders = await loadWorkOrders(fixturesPath);
  console.log(
    `${p.green("✓")} Loaded ${p.bold(String(workOrders.length))} work orders · rules module ${p.bold(String(rulesPackage.manifest.module))}@${rulesPackage.manifest.moduleVersion}`,
  );
  console.log("");
  await beat(900);

  const tenant: TenantContext = {
    id: "exclusive-rentals",
    name: "Exclusive Rentals",
    locale: "en-CA",
    currency: "CAD",
    region: "London, ON",
  };

  const result = await audit({
    rulesPackage,
    workOrders,
    tenant,
    skipLlm,
    model: modelOverride,
    log: async (m) => {
      console.log(p.gray(m));
      await beat(400);
    },
  });

  const t1 = Date.now();

  console.log("");
  await beat(500);
  console.log(p.bold(p.cyan("━━━ audit alerts ━━━")));
  await beat(300);
  if (result.alerts.length === 0) {
    console.log(`  ${p.green("✓")} No alerts — batch is clean.`);
  } else {
    for (const a of result.alerts) {
      printAlertLine(a);
      // Alerts are the visual punchline — hold each long enough for the
      // narration to land and the audience to read the rationale.
      await beat(Math.max(DEMO_PACE_MS, 2500));
    }
  }
  console.log("");
  await beat(400);

  const counts = result.summary.alertsByType;
  const summaryLine = [
    `WOs scanned: ${p.bold(String(result.summary.workOrdersScanned))}`,
    `alerts: ${p.bold(String(result.alerts.length))}`,
    `high severity: ${p.bold(String(result.summary.highSeverityCount))}`,
    `duplicates: ${counts.DUPLICATE_WO ?? 0}`,
    `weak closures: ${counts.WEAK_CLOSURE ?? 0}`,
    `follow-up risk: ${counts.FOLLOW_UP_RISK ?? 0}`,
    `missing evidence: ${counts.MISSING_EVIDENCE ?? 0}`,
  ].join(p.gray(" · "));
  console.log(p.bold("  summary: ") + summaryLine);
  console.log(p.gray(`  elapsed: ${(t1 - t0) / 1000}s`));
  console.log("");

  // write artifacts
  const runId = `sentinel-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const modelLabel = skipLlm
    ? "stage-A only (no LLM)"
    : (modelOverride ??
      (rulesPackage.rules.classification as Record<string, unknown> | undefined)?.model ??
      "claude-sonnet-4-5");

  const html = renderReport({
    tenant,
    title: "Sentinel — Work Order Audit",
    subtitle: `${workOrders.length} closed work orders audited · ${result.alerts.length} alert${result.alerts.length === 1 ? "" : "s"} flagged.`,
    sections: buildSections(result.alerts, workOrders),
    metadata: {
      runId,
      runAt: new Date(),
      model: String(modelLabel),
      extras: [
        ["High severity", String(result.summary.highSeverityCount)],
        ["Module", `${rulesPackage.manifest.module}@${rulesPackage.manifest.moduleVersion}`],
        ["Rules version", rulesPackage.manifest.rulesVersion],
      ],
    },
    dataBanner:
      "Synthetic demo data — fabricated fixtures, not real PropertyWare records. Audit logic and alert shape are production-grade.",
  });

  await writeFile(reportPath, html, "utf8");
  await writeFile(
    jsonPath,
    JSON.stringify(
      { runId, runAt: new Date().toISOString(), tenant, result },
      null,
      2,
    ),
    "utf8",
  );

  console.log(p.green("✓") + " Report written");
  console.log(p.dim(`  ${reportPath}`));
  console.log(p.dim(`  ${jsonPath}`));
  console.log("");
}

main().catch((err) => {
  console.error("\x1b[31m✗ audit failed:\x1b[0m", err);
  process.exit(1);
});
