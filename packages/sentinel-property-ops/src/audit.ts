/**
 * Sentinel work-order audit loop.
 *
 * Two-stage pipeline:
 *
 *   Stage A — deterministic pre-pass (no LLM):
 *     • DUPLICATE_WO       same unit, overlapping description, 14d window
 *     • MISSING_EVIDENCE   photosCount===0, costUsd>=threshold, photo-required category
 *
 *   Stage B — LLM pass (one batched call):
 *     • WEAK_CLOSURE       closure doesn't meet tenant's closure standard
 *     • FOLLOW_UP_RISK     repeat-visit pattern with punted closure
 *
 * Both stages merge into a single AuditResult. Per-alert `source` records
 * whether an alert came from deterministic rules or the LLM.
 */

import {
  renderPrompt,
  runClaudeStructured,
  type RulesPackage,
  type TenantContext,
} from "@broomva/life-modules-core";
import {
  AuditAlertSchema,
  type AuditAlert,
  type AuditAlertType,
  type AuditResult,
  type AuditSummary,
  type WorkOrder,
} from "./types.ts";
import { runClaudeStructuredOauth } from "./claude-oauth-shim.ts";
import { z } from "zod";

/**
 * The shared `@broomva/life-modules-core` client uses X-Api-Key auth. Claude
 * Code sessions only have an OAuth token (sk-ant-oat01-…), which needs Bearer
 * auth and the Claude Code preamble. When running in that context, set
 * SENTINEL_USE_OAUTH_SHIM=1 in the env and this file routes through a shim.
 * Core stays untouched — follow-up logged in the final report.
 */
const USE_OAUTH_SHIM = process.env.SENTINEL_USE_OAUTH_SHIM === "1";

export interface AuditOptions {
  rulesPackage: RulesPackage;
  workOrders: WorkOrder[];
  tenant: TenantContext;
  /** Skip the LLM pass — emit only stage A alerts. Useful for offline smoke. */
  skipLlm?: boolean;
  /** Override model. Defaults to what the tenant's classification.yaml specifies. */
  model?: string;
  /** Logger hook — called with short progress strings. Defaults to console.log. May be async. */
  log?: (msg: string) => void | Promise<void>;
}

// ---------- stage A (deterministic) ----------

const STOP_WORDS = new Set([
  "a", "an", "and", "the", "of", "in", "on", "at", "to", "for", "with", "is",
  "are", "was", "were", "be", "been", "has", "have", "had", "no", "not", "or",
  "but", "as", "it", "its", "this", "that", "please", "also",
  "tenant", "reports", "report", "reported", "check", "please", "visit",
]);

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]+/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2 && !STOP_WORDS.has(t)),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * Overlap coefficient = |A ∩ B| / min(|A|, |B|).
 * More forgiving than Jaccard when descriptions differ in length. Catches the
 * Brough-Street pattern where the first WO enumerates five items and the
 * follow-up only lists the unresolved two.
 */
function overlapCoefficient(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / Math.min(a.size, b.size);
}

function descriptionSimilarity(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  return Math.max(jaccard(ta, tb), overlapCoefficient(ta, tb));
}

function woUnitKey(wo: WorkOrder): string {
  return `${wo.propertyId}::${wo.unitId ?? "_"}`;
}

function parseDate(iso: string | undefined): Date | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? undefined : d;
}

function daysBetween(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / 86_400_000;
}

interface DeterministicThresholds {
  duplicateWindowDays: number;
  duplicateSimilarityThreshold: number;
  duplicateHighSeverityWindowDays: number;
  missingEvidenceCostUsd: number;
  missingEvidenceCategories: string[];
}

function readThresholds(pkg: RulesPackage): DeterministicThresholds {
  const det = (pkg.rules.deterministic ?? {}) as Record<string, unknown>;
  const dup = (det.duplicate_candidates ?? {}) as Record<string, unknown>;
  const miss = (det.missing_evidence ?? {}) as Record<string, unknown>;
  const categories = Array.isArray(miss.require_photos_categories)
    ? (miss.require_photos_categories as string[])
    : ["plumbing", "hvac", "structural", "roofing", "electrical"];
  return {
    duplicateWindowDays: Number(dup.time_window_days ?? 14),
    duplicateSimilarityThreshold: Number(dup.similarity_threshold ?? 0.4),
    duplicateHighSeverityWindowDays: Number(dup.high_severity_window_days ?? 7),
    missingEvidenceCostUsd: Number(miss.cost_threshold_usd ?? 500),
    missingEvidenceCategories: categories.map((c) => c.toLowerCase()),
  };
}

function detectDuplicates(
  workOrders: WorkOrder[],
  t: DeterministicThresholds,
): AuditAlert[] {
  const alerts: AuditAlert[] = [];
  const groups = new Map<string, WorkOrder[]>();
  for (const wo of workOrders) {
    const key = woUnitKey(wo);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(wo);
  }

  for (const bucket of groups.values()) {
    if (bucket.length < 2) continue;
    // Sort by openedAt ascending for stable pairing.
    const sorted = [...bucket].sort((a, b) => a.openedAt.localeCompare(b.openedAt));
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const a = sorted[i];
        const b = sorted[j];
        // Duplicate gap = time from the earlier WO's closure (or opening
        // if never closed) to the later WO's opening. This captures "ticket
        // reopened for the same issue shortly after prior close" — the
        // Brough Street pattern — which a raw open-to-open gap can miss.
        const aEdge = parseDate(a.closedAt) ?? parseDate(a.openedAt);
        const bOpen = parseDate(b.openedAt);
        if (!aEdge || !bOpen) continue;
        const gap = daysBetween(aEdge, bOpen);
        if (gap > t.duplicateWindowDays) continue;
        const sim = descriptionSimilarity(a.description, b.description);
        if (sim < t.duplicateSimilarityThreshold) continue;

        const high = gap <= t.duplicateHighSeverityWindowDays;
        const severity: AuditAlert["severity"] = high ? "high" : "medium";
        alerts.push({
          type: "DUPLICATE_WO",
          severity,
          relatedWoIds: [a.id, b.id],
          rationale:
            `Two work orders on ${a.propertyId}${a.unitId ? ` (${a.unitId})` : ""} within ${Math.round(gap)} days ` +
            `describe overlapping issues (Jaccard ${(sim * 100).toFixed(0)}% on keyword tokens). ` +
            `First closure may not have fully resolved the underlying problem, or the second ticket duplicates billing.`,
          suggestedAction:
            `Review ${a.id} closure against ${b.id} description — if root cause was not addressed, treat as repeat failure and re-dispatch under a single WO.`,
          confidence: Math.min(0.95, 0.6 + sim * 0.5),
          citations: [],
          source: "deterministic",
        });
      }
    }
  }
  return alerts;
}

function detectMissingEvidence(
  workOrders: WorkOrder[],
  t: DeterministicThresholds,
): AuditAlert[] {
  const alerts: AuditAlert[] = [];
  for (const wo of workOrders) {
    const cost = wo.costUsd ?? 0;
    const photos = wo.photosCount ?? 0;
    if (cost < t.missingEvidenceCostUsd) continue;
    if (photos > 0) continue;
    if (!t.missingEvidenceCategories.includes(wo.category.toLowerCase())) continue;
    alerts.push({
      type: "MISSING_EVIDENCE",
      severity: "medium",
      relatedWoIds: [wo.id],
      rationale:
        `${wo.category} repair at ${wo.propertyId}${wo.unitId ? ` (${wo.unitId})` : ""} closed at ` +
        `$${cost.toFixed(0)} with 0 photos. Exclusive's closure standard requires photo evidence for ${wo.category} ` +
        `work above $${t.missingEvidenceCostUsd}.`,
      suggestedAction: `Request vendor ${wo.vendorName ?? wo.vendorId ?? "of record"} to back-fill before/after photos.`,
      confidence: 0.92,
      citations: [],
      source: "deterministic",
    });
  }
  return alerts;
}

// ---------- stage B (LLM) ----------

const LLM_OUTPUT_TOOL = "emit_audit_alerts";

const LLM_OUTPUT_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    alerts: {
      type: "array",
      description:
        "Alerts emitted by the LLM pass. Focus on WEAK_CLOSURE and FOLLOW_UP_RISK. Do not re-emit DUPLICATE_WO or MISSING_EVIDENCE (the deterministic pre-pass handles those).",
      items: {
        type: "object",
        required: ["type", "severity", "relatedWoIds", "rationale", "confidence"],
        properties: {
          type: {
            type: "string",
            enum: ["WEAK_CLOSURE", "FOLLOW_UP_RISK"],
          },
          severity: { type: "string", enum: ["low", "medium", "high"] },
          relatedWoIds: {
            type: "array",
            items: { type: "string" },
            minItems: 1,
          },
          rationale: { type: "string" },
          suggestedAction: { type: "string" },
          confidence: { type: "number", minimum: 0, maximum: 1 },
        },
      },
    },
  },
  required: ["alerts"],
};

const LlmAlertsSchema = z.object({
  alerts: z.array(
    z.object({
      type: z.enum(["WEAK_CLOSURE", "FOLLOW_UP_RISK"]),
      severity: z.enum(["low", "medium", "high"]),
      relatedWoIds: z.array(z.string()).min(1),
      rationale: z.string().min(10),
      suggestedAction: z.string().optional(),
      confidence: z.number().min(0).max(1),
    }),
  ),
});

async function runLlmPass(
  workOrders: WorkOrder[],
  rulesPackage: RulesPackage,
  tenant: TenantContext,
  model: string,
  log: (msg: string) => void | Promise<void>,
): Promise<AuditAlert[]> {
  const systemTpl =
    rulesPackage.prompts.system ??
    "You are the Sentinel work-order auditor for {{ tenant.name }}.";

  const systemPrompt = await renderPrompt(systemTpl, {
    rules: {
      ...rulesPackage.rules,
      taxonomy: rulesPackage.taxonomy,
      sources: rulesPackage.sources,
    },
    tenant,
  });

  const userPayload = {
    instruction:
      "Audit the following closed work orders. Emit WEAK_CLOSURE and FOLLOW_UP_RISK alerts only. Call the emit_audit_alerts tool exactly once with your full alert list (empty array if clean).",
    work_orders: workOrders,
  };

  await log(
    `  → Claude ${model}: ${workOrders.length} WOs batched into one structured-output call${USE_OAUTH_SHIM ? " (oauth shim)" : ""}`,
  );

  const structuredOpts = {
    system: systemPrompt,
    user: `\`\`\`json\n${JSON.stringify(userPayload, null, 2)}\n\`\`\``,
    model,
    outputSchema: LlmAlertsSchema,
    outputToolName: LLM_OUTPUT_TOOL,
    outputToolDescription:
      "Emit the full list of audit alerts found in the batched work orders. Call exactly once. Use an empty alerts array if no alert-worthy pattern was found.",
    outputToolInputSchema: LLM_OUTPUT_JSON_SCHEMA,
    maxStructuredRetries: 2,
    maxTokens: 4096,
  } as const;

  const result = USE_OAUTH_SHIM
    ? await runClaudeStructuredOauth(structuredOpts)
    : await runClaudeStructured(structuredOpts);

  await log(`  ← Claude emitted ${result.output.alerts.length} alert(s)`);

  return result.output.alerts.map<AuditAlert>((a) => ({
    type: a.type as AuditAlertType,
    severity: a.severity,
    relatedWoIds: a.relatedWoIds,
    rationale: a.rationale,
    suggestedAction: a.suggestedAction,
    confidence: a.confidence,
    citations: [],
    source: "llm",
  }));
}

// ---------- glue ----------

function buildSummary(
  workOrdersScanned: number,
  alerts: AuditAlert[],
): AuditSummary {
  const alertsByType: Partial<Record<AuditAlertType, number>> = {};
  let highSev = 0;
  for (const a of alerts) {
    alertsByType[a.type] = (alertsByType[a.type] ?? 0) + 1;
    if (a.severity === "high") highSev++;
  }
  return {
    workOrdersScanned,
    alertsByType: alertsByType as Record<AuditAlertType, number>,
    highSeverityCount: highSev,
  };
}

function pickLlmModel(opts: AuditOptions): string {
  if (opts.model) return opts.model;
  const classification = (opts.rulesPackage.rules.classification ??
    {}) as Record<string, unknown>;
  const rulesModel = classification.model;
  if (typeof rulesModel === "string" && rulesModel.length > 0) return rulesModel;
  return "claude-sonnet-4-5";
}

export async function audit(opts: AuditOptions): Promise<AuditResult> {
  const log = opts.log ?? ((m: string) => console.log(m));

  const thresholds = readThresholds(opts.rulesPackage);
  await log(
    `Stage A — deterministic pre-pass (${opts.workOrders.length} WOs, ` +
      `duplicate window ${thresholds.duplicateWindowDays}d, missing-evidence >= $${thresholds.missingEvidenceCostUsd})`,
  );
  const deterministicAlerts = [
    ...detectDuplicates(opts.workOrders, thresholds),
    ...detectMissingEvidence(opts.workOrders, thresholds),
  ];
  await log(`  ✓ Stage A: ${deterministicAlerts.length} alert(s)`);

  let llmAlerts: AuditAlert[] = [];
  if (!opts.skipLlm) {
    const model = pickLlmModel(opts);
    await log(`Stage B — LLM classification (${opts.workOrders.length} WOs, model=${model})`);
    llmAlerts = await runLlmPass(
      opts.workOrders,
      opts.rulesPackage,
      opts.tenant,
      model,
      log,
    );
    await log(`  ✓ Stage B: ${llmAlerts.length} alert(s)`);
  } else {
    await log("Stage B — skipped (--no-llm)");
  }

  const merged = [...deterministicAlerts, ...llmAlerts];

  // Validate every alert through the canonical schema — defense in depth.
  const validated = merged.map((a) => AuditAlertSchema.parse(a));

  return {
    alerts: validated,
    summary: buildSummary(opts.workOrders.length, validated),
  };
}
