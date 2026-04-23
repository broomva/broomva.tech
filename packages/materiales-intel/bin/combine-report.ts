#!/usr/bin/env bun
/**
 * Combines 1..N existing query-result-*.json files from a directory into a
 * single HTML report. No LLM calls.
 *
 * Usage:
 *   bun run bin/combine-report.ts \
 *     --in     <dir-with-query-result-*.json> \
 *     --report <out.html> \
 *     --tenant-name "Constructora Cliente"
 */

import { readdir } from "node:fs/promises";
import { writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import {
  renderReport,
  type ReportItem,
  type ReportSection,
  type TenantContext,
} from "@broomva/life-modules-core";
import { QueryResultSchema, type QueryResult } from "../src/index.ts";

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
if (args.help === "true" || !args.in || !args.report) {
  console.log(
    "usage: bun run bin/combine-report.ts --in <dir> --report <out.html> [--tenant-name <name>]",
  );
  process.exit(0);
}

const formatCOP = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

async function main(): Promise<void> {
  const inDir = path.resolve(args.in);
  const reportPath = path.resolve(args.report);
  if (!existsSync(inDir)) {
    console.error(`✗ not a directory: ${inDir}`);
    process.exit(2);
  }
  const entries = (await readdir(inDir))
    .filter((f) => /^query-result-.*\.json$/i.test(f))
    .sort();
  if (entries.length === 0) {
    console.error(`✗ no query-result-*.json files in ${inDir}`);
    process.exit(2);
  }
  const results: QueryResult[] = [];
  for (const f of entries) {
    const raw = JSON.parse(await Bun.file(path.join(inDir, f)).text()) as unknown;
    const parsed = QueryResultSchema.parse(raw);
    results.push(parsed);
  }

  const tenant: TenantContext = {
    id: "_pending-constructora",
    name: args["tenant-name"] ?? "Constructora Cliente — Bogotá",
    locale: "es-CO",
    currency: "COP",
    region: "Bogotá, Colombia",
  };

  const sections: ReportSection[] = results.map<ReportSection>((result) => ({
    heading: `${result.query.family.toUpperCase()} — ${result.query.item}`,
    intro:
      (result.notes ? `${result.notes}\n\n` : "") +
      `Mediana: ${formatCOP.format(result.medianUnitPriceCop)} · Spread: ${(result.spread * 100).toFixed(
        1,
      )}% · ${result.suppliers.length} proveedor(es) (modo ${result.query.mode}).`,
    items: result.suppliers.map<ReportItem>((s) => ({
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
    })),
  }));

  const html = renderReport({
    tenant,
    title: "Investigación de precios — demo materiales-intel",
    subtitle:
      "Consulta en vivo de precios unitarios con proveedores colombianos · 3 familias · Bogotá",
    sections,
    metadata: {
      runId: `combined-${new Date().toISOString().slice(0, 10)}`,
      runAt: new Date(),
      model: "claude-haiku-4-5",
      extras: [
        ["Familias consultadas", String(results.length)],
        [
          "Proveedores totales",
          String(results.reduce((acc, r) => acc + r.suppliers.length, 0)),
        ],
        [
          "URL fuentes totales",
          String(
            results.reduce((acc, r) => acc + r.suppliers.filter((s) => !!s.sourceUrl).length, 0),
          ),
        ],
      ],
    },
    dataBanner:
      "Datos en vivo — precios consultados en tiempo real de proveedores colombianos. Fuentes citadas en cada tarjeta.",
  });

  writeFileSync(reportPath, html, "utf8");
  console.log(`✓ Combined report written: ${reportPath}`);
  console.log(
    `  ${results.length} queries · ${results.reduce((a, r) => a + r.suppliers.length, 0)} suppliers total`,
  );
}

main().catch((err) => {
  console.error(`✗ fatal: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
