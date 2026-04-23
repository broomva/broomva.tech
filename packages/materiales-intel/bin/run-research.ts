#!/usr/bin/env bun
/**
 * CLI — Materiales Intel research runner.
 *
 * Runs one or more MaterialQuery fixtures through the live Claude web_search
 * research loop and produces:
 *   - per-query JSON result files (<out-dir>/query-result-<slug>.json)
 *   - per-query HTML reports     (<out-dir>/report-<slug>.html)
 *   - a combined HTML report     (<out-dir>/query-report.html)
 *
 * Usage:
 *   bun run bin/run-research.ts \
 *     --rules         <path-to-rules-package> \
 *     --query-fixture <fixture.json | dir of *.json> \
 *     --report        <combined-report.html>
 *
 *   --out-dir     overrides where per-query artifacts land (default: dirname of --report).
 *   --mode        overrides the fixture's mode (fast|standard|deep).
 *   --tenant-name overrides display name (default: derived from manifest).
 *   --dry-run     prints what would run without calling Claude.
 */

import { readdir } from "node:fs/promises";
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  loadRulesPackage,
  renderReport,
  type ReportItem,
  type ReportSection,
  type TenantContext,
} from "@broomva/life-modules-core";
import { MaterialQuerySchema, type MaterialQuery, type QueryResult } from "../src/index.ts";
import { research } from "../src/research.ts";

// ---------- arg parsing ----------
type Args = Record<string, string>;
function parseArgs(argv: string[]): Args {
  const out: Args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const k = a.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      out[k] = next;
      i++;
    } else {
      out[k] = "true";
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));

if (args.help === "true" || !args.rules || !args["query-fixture"]) {
  console.log(
    [
      "Materiales-Intel research runner",
      "",
      "usage: bun run bin/run-research.ts \\",
      "         --rules <path-to-rules-package> \\",
      "         --query-fixture <fixture.json | dir of *.json> \\",
      "         --report <combined-report.html>",
      "",
      "Optional:",
      "  --out-dir <dir>     where per-query artifacts land",
      "  --mode <fast|standard|deep>  override fixture mode",
      "  --tenant-name <name>         display name for the tenant",
      "  --dry-run                    load rules + fixture, no LLM call",
      "  --help                       show this message",
    ].join("\n"),
  );
  process.exit(0);
}

// ---------- ANSI helpers for live terminal log ----------
const ANSI = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  magenta: "\x1b[35m",
};
const c = (color: keyof typeof ANSI, s: string): string => `${ANSI[color]}${s}${ANSI.reset}`;
const banner = (s: string): void => {
  console.log("");
  console.log(c("cyan", "━".repeat(Math.min(80, s.length + 4))));
  console.log(c("bold", c("cyan", `  ${s}`)));
  console.log(c("cyan", "━".repeat(Math.min(80, s.length + 4))));
};
const info = (s: string): void => console.log(c("dim", s));
const ok = (s: string): void => console.log(c("green", s));
const step = (s: string): void => console.log(c("magenta", s));

const formatCOP = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 64);
}

// ---------- main ----------
async function main(): Promise<void> {
  const rulesPath = path.resolve(args.rules);
  const fixtureArg = path.resolve(args["query-fixture"]);
  const reportPath = args.report ? path.resolve(args.report) : undefined;
  const outDir = args["out-dir"] ? path.resolve(args["out-dir"]) : reportPath ? path.dirname(reportPath) : path.resolve("./demo-output");

  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  banner("Materiales-Intel · Live Price Research");
  info(`rules:    ${rulesPath}`);
  info(`fixture:  ${fixtureArg}`);
  info(`out-dir:  ${outDir}`);
  if (reportPath) info(`report:   ${reportPath}`);

  step("→ Cargando rules-package");
  const rulesPackage = await loadRulesPackage(rulesPath);
  ok(
    `   ✓ ${Object.keys(rulesPackage.prompts).length} prompts · ${
      Object.keys(rulesPackage.rules).length
    } rules · ${(rulesPackage.taxonomy as { families?: unknown[] } | undefined)?.families?.length ?? 0} familias`,
  );

  // Build tenant context from the manifest.
  const manifest = rulesPackage.manifest as Record<string, unknown>;
  const tenant: TenantContext = {
    id: (manifest.tenantId as string | undefined) ?? (manifest.id as string | undefined) ?? "_pending-constructora",
    name:
      args["tenant-name"] ??
      (manifest.name as string | undefined) ??
      "Constructora Cliente",
    locale: "es-CO",
    currency: "COP",
    region: "Bogotá, Colombia",
  };
  info(`   tenant: ${tenant.id} — ${tenant.name}`);

  // Load fixtures (one file or a dir).
  const fixtures: Array<{ slug: string; query: MaterialQuery; src: string }> = [];
  const fstat = statSync(fixtureArg);
  if (fstat.isDirectory()) {
    const entries = (await readdir(fixtureArg)).filter((f) => /\.json$/i.test(f));
    for (const f of entries) {
      const fp = path.join(fixtureArg, f);
      const raw = JSON.parse(await Bun.file(fp).text()) as unknown;
      const parsed = MaterialQuerySchema.parse(raw);
      fixtures.push({ slug: slugify(path.basename(f, ".json")), query: parsed, src: fp });
    }
  } else {
    const raw = JSON.parse(await Bun.file(fixtureArg).text()) as unknown;
    const parsed = MaterialQuerySchema.parse(raw);
    fixtures.push({
      slug: slugify(path.basename(fixtureArg, ".json")),
      query: parsed,
      src: fixtureArg,
    });
  }
  if (args.mode) {
    for (const fx of fixtures) {
      (fx.query as { mode: string }).mode = args.mode;
    }
  }
  info(`   fixtures: ${fixtures.length}`);

  if (args["dry-run"] === "true") {
    ok("\n[dry-run] rules + fixtures loaded cleanly. No LLM call made.");
    return;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(
      c("yellow", "\n⚠ ANTHROPIC_API_KEY is not set. Export it in your shell or source .env.local before running."),
    );
    process.exit(2);
  }

  // Run each fixture sequentially (avoid rate limits).
  const results: Array<{ slug: string; result: QueryResult }> = [];
  for (const fx of fixtures) {
    banner(`${fx.query.family.toUpperCase()} · ${fx.query.item}`);
    step(`→ Modo: ${fx.query.mode}  ·  Región: ${fx.query.region}  ·  Cantidad: ${fx.query.quantity ?? "n/a"}`);
    let result: QueryResult | undefined;
    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        result = await research({
          rulesPackage,
          query: fx.query,
          tenant,
          model: args.model ?? "claude-haiku-4-5",
          onProgress: (msg) => console.log(c("cyan", msg)),
        });
        break;
      } catch (err) {
        lastErr = err;
        const msg = err instanceof Error ? err.message : String(err);
        const isRateLimit = /429|rate_limit/i.test(msg);
        const isOverloaded = /529|overloaded/i.test(msg);
        if ((isRateLimit || isOverloaded) && attempt < 2) {
          const waitMs = (attempt + 1) * 15_000;
          console.error(c("yellow", `   ↻ rate-limit/overloaded — esperando ${waitMs / 1000}s antes de reintentar…`));
          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }
        break;
      }
    }
    if (result) {
      results.push({ slug: fx.slug, result });

      const jsonOut = path.join(outDir, `query-result-${fx.slug}.json`);
      writeFileSync(jsonOut, JSON.stringify(result, null, 2), "utf8");
      ok(`   ✓ JSON: ${jsonOut}`);

      const perQueryHtml = renderSingleReport(result, tenant);
      const htmlOut = path.join(outDir, `report-${fx.slug}.html`);
      writeFileSync(htmlOut, perQueryHtml, "utf8");
      ok(`   ✓ HTML: ${htmlOut}`);

      ok(
        `   ✓ median ${formatCOP.format(result.medianUnitPriceCop)} · spread ${(
          result.spread * 100
        ).toFixed(1)}%`,
      );
    } else {
      const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
      console.error(c("yellow", `   ✗ falló: ${msg}`));
    }
  }

  if (reportPath && results.length > 0) {
    const combined = renderCombinedReport(results, tenant);
    writeFileSync(reportPath, combined, "utf8");
    ok(`\n✓ Combined report: ${reportPath}`);
  }

  banner("Done");
  for (const r of results) {
    ok(
      `· ${r.result.query.family}/${r.result.query.item} → ${r.result.suppliers.length} proveedores · median ${formatCOP.format(
        r.result.medianUnitPriceCop,
      )}`,
    );
  }
}

// ---------- rendering ----------
function toReportItems(result: QueryResult): ReportItem[] {
  return result.suppliers.map<ReportItem>((s) => ({
    tag: s.supplier,
    tagTone: "info",
    title: `${s.unitPriceFormatted} / ${s.unit}`,
    body: s.stockNotes,
    confidence: s.confidence,
    facts: [
      ["Proveedor", s.supplier],
      ["Precio unitario", s.unitPriceFormatted],
      ["Unidad", s.unit],
      ["Consultado", new Date(s.fetchedAt).toLocaleString("es-CO")],
    ],
    citations: [
      {
        url: s.sourceUrl,
        title: s.sourceTitle,
        fetchedAt: s.fetchedAt,
      },
    ],
    actionUrl: s.sourceUrl,
    actionLabel: "Cotizar con el proveedor",
  }));
}

function renderSingleReport(result: QueryResult, tenant: TenantContext): string {
  const section: ReportSection = {
    heading: `Proveedores consultados — ${result.query.item}`,
    intro: result.notes,
    items: toReportItems(result),
  };
  return renderReport({
    tenant,
    title: `Precio unitario · ${result.query.item}`,
    subtitle: `${result.query.family} · ${result.query.region} · modo ${result.query.mode}`,
    sections: [section],
    metadata: {
      runId: result.runId,
      runAt: new Date(result.runAt),
      model: "claude-haiku-4-5",
      extras: [
        ["Cantidad consultada", `${result.query.quantity ?? "n/a"} ${result.query.unit ?? ""}`.trim()],
        ["Mediana unitaria", formatCOP.format(result.medianUnitPriceCop)],
        ["Spread min–max", `${(result.spread * 100).toFixed(1)}%`],
        ["Proveedores", String(result.suppliers.length)],
      ],
    },
    dataBanner:
      "Datos en vivo — precios consultados en tiempo real de proveedores colombianos. Fuentes citadas en cada tarjeta.",
  });
}

function renderCombinedReport(
  results: Array<{ slug: string; result: QueryResult }>,
  tenant: TenantContext,
): string {
  const sections: ReportSection[] = results.map(({ result }) => ({
    heading: `${result.query.family.toUpperCase()} — ${result.query.item}`,
    intro:
      (result.notes ? `${result.notes}\n\n` : "") +
      `Mediana: ${formatCOP.format(result.medianUnitPriceCop)} · Spread: ${(result.spread * 100).toFixed(
        1,
      )}% · ${result.suppliers.length} proveedores (modo ${result.query.mode}).`,
    items: toReportItems(result),
  }));
  return renderReport({
    tenant,
    title: "Investigación de precios — demo materiales-intel",
    subtitle: "Consulta en vivo de precios unitarios con proveedores colombianos · Bogotá",
    sections,
    metadata: {
      runId: `combined-${new Date().toISOString().slice(0, 10)}`,
      runAt: new Date(),
      model: "claude-haiku-4-5",
      extras: [
        ["Familias consultadas", String(results.length)],
        [
          "Proveedores totales",
          String(results.reduce((acc, r) => acc + r.result.suppliers.length, 0)),
        ],
      ],
    },
    dataBanner:
      "Datos en vivo — precios consultados en tiempo real de proveedores colombianos. Fuentes citadas en cada tarjeta.",
  });
}

main().catch((err) => {
  console.error(c("yellow", `\n✗ fatal: ${err instanceof Error ? err.message : String(err)}`));
  console.error((err as Error)?.stack ?? "");
  process.exit(1);
});
