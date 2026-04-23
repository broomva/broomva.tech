/**
 * Self-contained HTML report renderer.
 *
 * Produces a single HTML document with inline CSS (no external assets) so the
 * output is directly attachable to email or openable from local disk. Styling
 * borrows the Arcan Glass design language (dark background, glass panels,
 * subtle gradient accents) while keeping the markup email-client friendly.
 */

import type { Citation, TenantContext } from "./types.ts";

export interface ReportItem {
  /** Short tag rendered as a pill (e.g. alert type, supplier name). */
  tag?: string;
  /** Accent color for the tag pill. Defaults to neutral. */
  tagTone?: "neutral" | "success" | "warning" | "danger" | "info";
  title: string;
  body?: string;
  /** Renders a <table> of key→value rows under the body. */
  facts?: Array<[string, string | number]>;
  citations?: Citation[];
  actionUrl?: string;
  actionLabel?: string;
  /** Confidence badge (0–1 maps to Low/Med/High). */
  confidence?: number;
}

export interface ReportSection {
  heading: string;
  intro?: string;
  items: ReportItem[];
}

export interface RenderReportOpts {
  tenant: TenantContext;
  title: string;
  subtitle?: string;
  sections: ReportSection[];
  metadata: {
    runId: string;
    runAt: Date;
    model: string;
    totalCost?: string;
    extras?: Array<[string, string]>;
  };
  /** "synthetic demo data" or "live data" disclosure. */
  dataBanner?: string;
  /** BCP-47 locale for number/date formatting (defaults to tenant.locale). */
  locale?: string;
}

const CSS = `
  :root {
    color-scheme: dark;
    --bg: #0a0b0f;
    --panel: rgba(255,255,255,0.04);
    --panel-border: rgba(255,255,255,0.08);
    --text: #e7e9ee;
    --muted: #9aa3b2;
    --accent: #7c5cff;
    --accent-2: #22d3ee;
    --tone-neutral: #3a3f4b;
    --tone-success: #16a34a;
    --tone-warning: #d97706;
    --tone-danger: #dc2626;
    --tone-info: #2563eb;
  }
  * { box-sizing: border-box; }
  html, body { background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, sans-serif; margin: 0; padding: 0; }
  .wrap { max-width: 960px; margin: 0 auto; padding: 40px 24px 80px; }
  header.hero { padding: 24px 0 32px; border-bottom: 1px solid var(--panel-border); margin-bottom: 32px; }
  .eyebrow { color: var(--muted); font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; margin-bottom: 8px; }
  h1 { font-size: 30px; line-height: 1.2; margin: 0 0 8px; font-weight: 700; letter-spacing: -0.01em; }
  .subtitle { color: var(--muted); font-size: 15px; margin: 0; }
  .banner { margin-top: 16px; padding: 10px 14px; border-radius: 10px; background: rgba(217,119,6,0.1); border: 1px solid rgba(217,119,6,0.35); color: #fbbf24; font-size: 13px; }
  .banner.ok { background: rgba(22,163,74,0.1); border-color: rgba(22,163,74,0.35); color: #4ade80; }
  section.block { margin-bottom: 40px; }
  section.block h2 { font-size: 20px; margin: 0 0 8px; font-weight: 600; letter-spacing: -0.005em; }
  section.block .intro { color: var(--muted); font-size: 14px; margin: 0 0 20px; line-height: 1.6; }
  .card { background: var(--panel); border: 1px solid var(--panel-border); border-radius: 14px; padding: 20px 22px; margin-bottom: 14px; backdrop-filter: blur(12px); }
  .card-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; }
  .card-title { font-weight: 600; font-size: 16px; margin: 0; }
  .pill { display: inline-flex; align-items: center; padding: 3px 10px; border-radius: 999px; font-size: 11px; letter-spacing: 0.04em; font-weight: 600; text-transform: uppercase; background: var(--tone-neutral); color: #fff; }
  .pill.success { background: var(--tone-success); }
  .pill.warning { background: var(--tone-warning); }
  .pill.danger { background: var(--tone-danger); }
  .pill.info { background: var(--tone-info); }
  .confidence { margin-left: auto; font-size: 12px; color: var(--muted); }
  .confidence strong { color: var(--text); }
  .body { font-size: 14px; line-height: 1.65; color: var(--text); margin: 0 0 12px; white-space: pre-wrap; }
  table.facts { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 13px; }
  table.facts td { padding: 6px 10px; border-bottom: 1px solid var(--panel-border); }
  table.facts td:first-child { color: var(--muted); width: 35%; }
  table.facts tr:last-child td { border-bottom: none; }
  ul.citations { list-style: none; padding: 0; margin: 12px 0 0; font-size: 12px; color: var(--muted); }
  ul.citations li { margin-bottom: 4px; }
  ul.citations a { color: var(--accent-2); text-decoration: none; }
  ul.citations a:hover { text-decoration: underline; }
  .action { display: inline-block; margin-top: 12px; padding: 8px 14px; border-radius: 10px; background: linear-gradient(135deg, var(--accent), var(--accent-2)); color: #fff; font-weight: 600; font-size: 13px; text-decoration: none; }
  footer { margin-top: 48px; padding-top: 24px; border-top: 1px solid var(--panel-border); color: var(--muted); font-size: 12px; line-height: 1.7; }
  footer dl { display: grid; grid-template-columns: auto 1fr; gap: 4px 16px; }
  footer dt { color: var(--muted); }
  footer dd { margin: 0; color: var(--text); font-variant-numeric: tabular-nums; }
  @media (max-width: 768px) {
    .wrap { padding: 24px 16px 60px; }
    h1 { font-size: 24px; }
  }
`;

const esc = (s: string | number | undefined): string => {
  if (s === undefined || s === null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
};

function confidenceLabel(c: number): string {
  if (c >= 0.8) return `<strong>High</strong> confidence`;
  if (c >= 0.5) return `<strong>Medium</strong> confidence`;
  return `<strong>Low</strong> confidence`;
}

function renderItem(item: ReportItem): string {
  const tag = item.tag
    ? `<span class="pill ${item.tagTone ?? "neutral"}">${esc(item.tag)}</span>`
    : "";
  const confidence =
    typeof item.confidence === "number"
      ? `<span class="confidence">${confidenceLabel(item.confidence)}</span>`
      : "";
  const facts = item.facts?.length
    ? `<table class="facts">${item.facts
        .map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`)
        .join("")}</table>`
    : "";
  const citations = item.citations?.length
    ? `<ul class="citations">${item.citations
        .map(
          (c) =>
            `<li>↪ <a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.title ?? c.url)}</a>${
              c.snippet ? ` — <em>${esc(c.snippet)}</em>` : ""
            }</li>`,
        )
        .join("")}</ul>`
    : "";
  const action = item.actionUrl
    ? `<a class="action" href="${esc(item.actionUrl)}" target="_blank" rel="noopener">${esc(item.actionLabel ?? "Abrir")}</a>`
    : "";
  return `<div class="card">
    <div class="card-head">${tag}<h3 class="card-title">${esc(item.title)}</h3>${confidence}</div>
    ${item.body ? `<p class="body">${esc(item.body)}</p>` : ""}
    ${facts}
    ${action}
    ${citations}
  </div>`;
}

function renderSection(section: ReportSection): string {
  return `<section class="block">
    <h2>${esc(section.heading)}</h2>
    ${section.intro ? `<p class="intro">${esc(section.intro)}</p>` : ""}
    ${section.items.map(renderItem).join("")}
  </section>`;
}

export function renderReport(opts: RenderReportOpts): string {
  const locale = opts.locale ?? opts.tenant.locale;
  const runAt = opts.metadata.runAt.toLocaleString(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const banner = opts.dataBanner
    ? `<div class="banner ${/live|real/i.test(opts.dataBanner) ? "ok" : ""}">${esc(opts.dataBanner)}</div>`
    : "";
  const extraFooterRows = (opts.metadata.extras ?? [])
    .map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`)
    .join("");
  return `<!doctype html>
<html lang="${esc(opts.tenant.locale)}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(opts.title)}</title>
<style>${CSS}</style>
</head>
<body>
  <main class="wrap">
    <header class="hero">
      <div class="eyebrow">${esc(opts.tenant.name)} · ${esc(opts.tenant.region)}</div>
      <h1>${esc(opts.title)}</h1>
      ${opts.subtitle ? `<p class="subtitle">${esc(opts.subtitle)}</p>` : ""}
      ${banner}
    </header>
    ${opts.sections.map(renderSection).join("")}
    <footer>
      <dl>
        <dt>Run ID</dt><dd>${esc(opts.metadata.runId)}</dd>
        <dt>Run at</dt><dd>${esc(runAt)}</dd>
        <dt>Model</dt><dd>${esc(opts.metadata.model)}</dd>
        ${opts.metadata.totalCost ? `<dt>Cost</dt><dd>${esc(opts.metadata.totalCost)}</dd>` : ""}
        ${extraFooterRows}
      </dl>
    </footer>
  </main>
</body>
</html>`;
}
