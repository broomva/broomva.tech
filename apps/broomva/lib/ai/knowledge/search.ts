/**
 * Pure keyword search over an AgentKnowledge snapshot. No I/O: callers load
 * the knowledge themselves. Split out of site-content.ts so a route can search
 * without importing that module's dynamic-path fs reads, which make Turbopack
 * trace the whole project (public/ media included) into the function
 * (BRO-3994).
 */
import type { AgentDocument, AgentKnowledge } from "./types";

export interface SiteSearchResult {
  id: string;
  title: string;
  slug: string;
  kind: AgentDocument["kind"];
  url: string;
  summary: string;
  tags: string[];
  excerpts: string[];
  wikilinks: string[];
  score: number;
}

export interface SearchOptions {
  maxResults?: number;
}

/** Build an excerpt around the first match of any query term. */
function excerpt(body: string, terms: string[], radius = 140): string {
  if (!body) return "";
  const lower = body.toLowerCase();
  let bestPos = -1;
  for (const term of terms) {
    const pos = lower.indexOf(term);
    if (pos !== -1 && (bestPos === -1 || pos < bestPos)) bestPos = pos;
  }
  if (bestPos === -1) return body.slice(0, radius * 2);
  const start = Math.max(0, bestPos - radius);
  const end = Math.min(body.length, bestPos + radius);
  return `${start > 0 ? "… " : ""}${body.slice(start, end).replace(/\s+/g, " ").trim()}${end < body.length ? " …" : ""}`;
}

export function searchKnowledge(
  knowledge: AgentKnowledge,
  query: string,
  opts: SearchOptions = {},
): SiteSearchResult[] {
  const { maxResults = 8 } = opts;
  if (knowledge.documents.length === 0) return [];

  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter((t) => t.length >= 2);
  if (terms.length === 0) return [];

  // Score per doc: title match (3), summary (2), tag (2), body term (1 per term).
  const scores = new Map<string, number>();

  for (const doc of knowledge.documents) {
    const title = doc.title.toLowerCase();
    const summary = doc.summary.toLowerCase();
    const body = doc.body.toLowerCase();
    const tagSet = new Set(doc.tags.map((t) => t.toLowerCase()));
    let score = 0;

    for (const term of terms) {
      if (title.includes(term)) score += 3;
      if (summary.includes(term)) score += 2;
      if (tagSet.has(term)) score += 2;
      if (body.includes(term)) score += 1;
    }

    if (score > 0) scores.set(doc.id, score);
  }

  const ranked = [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxResults);

  const docById = new Map(knowledge.documents.map((d) => [d.id, d]));

  return ranked.map(([id, score]) => {
    const doc = docById.get(id)!;
    return {
      id: doc.id,
      title: doc.title,
      slug: doc.slug,
      kind: doc.kind,
      url: doc.url,
      summary: doc.summary,
      tags: doc.tags,
      excerpts: [excerpt(doc.body, terms)],
      wikilinks: doc.wikilinks,
      score,
    };
  });
}
