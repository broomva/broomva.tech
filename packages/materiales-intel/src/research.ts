/**
 * Materiales-Intel research loop.
 *
 * One Claude structured-output call per MaterialQuery, with the Anthropic
 * `web_search_20250305` tool constrained to the tenant's whitelisted Colombian
 * supplier domains. The LLM is required to call the `emit_query_result` tool
 * with a strict schema so we get back typed SupplierQuote[] — no text parsing.
 *
 * Output (QueryResult) includes the per-supplier citations (URL + title),
 * confidence, unit-normalized COP price, a median/spread summary, and a
 * `runId` / `runAt` stamp for the HTML report.
 */

import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  runClaudeStructured,
  renderPrompt,
  type RulesPackage,
  type TenantContext,
} from "@broomva/life-modules-core";
import {
  SupplierQuoteSchema,
  type MaterialQuery,
  type QueryResult,
  type SupplierQuote,
} from "./types.ts";

// ---------- schema for the LLM output tool ----------
// This is the *intermediate* shape emitted by the model via emit_query_result.
// We reconstruct the full QueryResult (adding query/median/spread/runId/runAt)
// from this partial.
const StructuredOutputSchema = z.object({
  suppliers: z.array(SupplierQuoteSchema).min(1),
  notes: z.string().optional(),
});
type StructuredOutput = z.infer<typeof StructuredOutputSchema>;

// JSON-Schema mirror for the Anthropic tool spec.
const OUTPUT_TOOL_INPUT_SCHEMA = {
  type: "object",
  properties: {
    suppliers: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        required: [
          "supplier",
          "unitPriceCop",
          "unitPriceFormatted",
          "unit",
          "sourceUrl",
          "sourceTitle",
          "confidence",
          "fetchedAt",
        ],
        properties: {
          supplier: { type: "string" },
          unitPriceCop: { type: "number" },
          unitPriceFormatted: { type: "string" },
          unit: { type: "string" },
          stockNotes: { type: "string" },
          sourceUrl: { type: "string" },
          sourceTitle: { type: "string" },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          fetchedAt: { type: "string" },
        },
      },
    },
    notes: { type: "string" },
  },
  required: ["suppliers"],
} as const;

export interface ResearchOptions {
  rulesPackage: RulesPackage;
  query: MaterialQuery;
  tenant: TenantContext;
  /** Progress callback for live terminal output (asciinema capture). */
  onProgress?: (msg: string) => void;
  /** Override model; defaults to claude-sonnet-4-5. */
  model?: string;
  /** Upper cap on web_search uses; otherwise derived from mode. */
  maxSearches?: number;
  /** Timeout per LLM call in ms. Default 150_000. */
  timeoutMs?: number;
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function spread(nums: number[]): number {
  if (nums.length === 0) return 0;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  return min === 0 ? 0 : (max - min) / min;
}

export async function research(opts: ResearchOptions): Promise<QueryResult> {
  const { rulesPackage, query, tenant, onProgress = () => {} } = opts;

  onProgress(`🔎 Cargando reglas del tenant: ${tenant.id}`);

  // pick the mode-specific prompt (falls back to standard / system).
  const modeTemplate =
    rulesPackage.prompts[query.mode] ??
    rulesPackage.prompts.standard ??
    rulesPackage.prompts.system;
  if (!modeTemplate) {
    throw new Error(
      `No prompt template found for mode '${query.mode}' in rules package ${rulesPackage.dir}`,
    );
  }

  const system = await renderPrompt(modeTemplate, {
    rules: {
      taxonomy: rulesPackage.taxonomy,
      sources: rulesPackage.sources,
      ...rulesPackage.rules,
      policy: rulesPackage.policy,
    },
    input: query,
    tenant,
  });

  const minSuppliers = query.mode === "fast" ? 1 : query.mode === "deep" ? 5 : 3;
  const user = [
    `Investiga el precio unitario actual del siguiente material en ${query.region}.`,
    `REQUISITO: tu respuesta final debe incluir **al menos ${minSuppliers} proveedores distintos** en la lista \`suppliers\`.`,
    `Haz múltiples búsquedas (\`web_search\`) — UNA POR PROVEEDOR — antes de llamar \`emit_query_result\`.`,
    `Proveedores a tantear explícitamente (haz una búsqueda separada para cada uno hasta acumular ${minSuppliers}):`,
    `  1. Homecenter — "varilla #4 Homecenter Colombia" / "cemento Argos 50kg Homecenter" / "porcelanato 60x60 Homecenter"`,
    `  2. Sodimac — misma búsqueda, dominio Sodimac.com.co`,
    `  3. Constructor o Easy — mismo producto`,
    `  4. Si aplica al producto, el fabricante directo: Argos / Cemex / Holcim (cemento); Corona / Alfagres / Cerámica Italia (pisos); Grival / FV / Acquagrif (grifería); Pavco / Gerfor (tubería); Pintuco / Sherwin (pintura).`,
    ``,
    `Cuando tengas ${minSuppliers}+ proveedores con precio verificado en la URL, llama \`emit_query_result\`. No llames a la herramienta hasta haber recolectado esa diversidad.`,
    ``,
    `Detalles de la consulta:`,
    JSON.stringify(query, null, 2),
  ].join("\n");

  const allowedDomains =
    (rulesPackage.sources as { allowed_domains?: string[] } | undefined)?.allowed_domains ?? [];
  const maxSearches =
    opts.maxSearches ?? (query.mode === "fast" ? 2 : query.mode === "deep" ? 8 : 4);

  onProgress(
    `🌐 Invocando Claude + web_search (hasta ${maxSearches} búsquedas en ${allowedDomains.length} dominios colombianos)`,
  );
  onProgress(`📋 Modo: ${query.mode}  ·  Familia: ${query.family}  ·  Item: ${query.item}`);

  const result = await runClaudeStructured<StructuredOutput>({
    system,
    user,
    maxTokens: 4096,
    model: opts.model,
    timeoutMs: opts.timeoutMs ?? 150_000,
    extraTools: [
      {
        type: "web_search_20250305",
        name: "web_search",
        allowed_domains: allowedDomains,
        max_uses: maxSearches,
      },
    ],
    outputToolName: "emit_query_result",
    outputToolDescription:
      "Emite el resultado de la investigación de precio con los proveedores y citas.",
    outputToolInputSchema: OUTPUT_TOOL_INPUT_SCHEMA as unknown as Record<string, unknown>,
    outputSchema: StructuredOutputSchema,
    maxStructuredRetries: 2,
  });

  const suppliers: SupplierQuote[] = result.output.suppliers;
  onProgress(`✅ ${suppliers.length} proveedor(es) encontrados`);
  for (const s of suppliers) {
    onProgress(
      `   → ${s.supplier}: ${s.unitPriceFormatted} / ${s.unit}  (conf ${Math.round(
        s.confidence * 100,
      )}%)`,
    );
  }

  const prices = suppliers.map((s) => s.unitPriceCop);
  const medianPrice = median(prices);
  const spreadRatio = spread(prices);

  const now = new Date().toISOString();
  const runId = `mat-${now.slice(0, 10)}-${randomUUID().slice(0, 8)}`;

  return {
    query,
    suppliers,
    medianUnitPriceCop: medianPrice,
    spread: spreadRatio,
    notes: result.output.notes,
    runId,
    runAt: now,
  };
}
