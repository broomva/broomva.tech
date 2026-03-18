const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";

let noColor = false;

export function setNoColor(v: boolean): void {
  noColor = v;
}

function c(code: string, text: string): string {
  return noColor ? text : `${code}${text}${RESET}`;
}

export const fmt = {
  bold: (t: string) => c(BOLD, t),
  dim: (t: string) => c(DIM, t),
  cyan: (t: string) => c(CYAN, t),
  green: (t: string) => c(GREEN, t),
  yellow: (t: string) => c(YELLOW, t),
  red: (t: string) => c(RED, t),
};

export function printJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

export function printTable(
  headers: string[],
  rows: string[][],
): void {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)),
  );

  const sep = widths.map((w) => "─".repeat(w + 2)).join("┼");
  const formatRow = (row: string[]) =>
    row.map((cell, i) => ` ${(cell ?? "").padEnd(widths[i])} `).join("│");

  console.log(fmt.bold(formatRow(headers)));
  console.log(fmt.dim(sep));
  for (const row of rows) {
    console.log(formatRow(row));
  }
}

export function printPrompt(prompt: {
  title: string;
  slug: string;
  content: string;
  category?: string | null;
  tags?: string[];
  model?: string | null;
  version?: string | null;
  summary?: string | null;
}): void {
  console.log(fmt.bold(fmt.cyan(prompt.title)));
  console.log(fmt.dim(`slug: ${prompt.slug}`));
  if (prompt.category) console.log(`category: ${prompt.category}`);
  if (prompt.tags?.length) console.log(`tags: ${prompt.tags.join(", ")}`);
  if (prompt.model) console.log(`model: ${prompt.model}`);
  if (prompt.version) console.log(`version: ${prompt.version}`);
  if (prompt.summary) console.log(`\n${fmt.dim(prompt.summary)}`);
  console.log(`\n${prompt.content}`);
}

export function info(msg: string): void {
  console.log(fmt.cyan("ℹ") + " " + msg);
}

export function success(msg: string): void {
  console.log(fmt.green("✓") + " " + msg);
}

export function warn(msg: string): void {
  console.log(fmt.yellow("⚠") + " " + msg);
}

export function error(msg: string): void {
  console.error(fmt.red("✗") + " " + msg);
}
