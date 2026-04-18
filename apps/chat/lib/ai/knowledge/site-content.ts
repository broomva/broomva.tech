/**
 * Runtime loader + query helpers for the agent knowledge JSON.
 *
 * The JSON is generated at build time by scripts/generate-agent-knowledge.ts
 * and lives at public/agent-knowledge.json. It is cached in-module after the
 * first load.
 *
 * Graceful degradation: if the file is missing or unparseable, this module
 * returns an empty knowledge object and logs once. The tools that depend on
 * it will return `{ error: "..." }` so the model gets a clean signal.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { createModuleLogger } from "@/lib/logger";
import type {
  AgentDocument,
  AgentGraphEdgeType,
  AgentGraphNode,
  AgentKnowledge,
} from "./types";

const log = createModuleLogger("ai:knowledge:site-content");

const EMPTY_KNOWLEDGE: AgentKnowledge = {
  generatedAt: "1970-01-01T00:00:00.000Z",
  commit: "unknown",
  documents: [],
  graph: { nodes: [], links: [] },
  invertedIndex: {},
};

let _cache: AgentKnowledge | null = null;
let _warned = false;

let _sourcePath: string | null = null;

function defaultSourcePath(): string {
  return path.join(process.cwd(), "public", "agent-knowledge.json");
}

/** Test-only: override the JSON path for fixture-based unit tests. */
export function __setKnowledgeSourceForTests(p: string): void {
  _sourcePath = p;
}

/** Test-only: clear the in-module cache. */
export function resetKnowledgeCacheForTests(): void {
  _cache = null;
  _warned = false;
}

// ── Loader ───────────────────────────────────────────────────────────────────

export async function loadAgentKnowledge(): Promise<AgentKnowledge> {
  if (_cache) return _cache;

  const source = _sourcePath ?? defaultSourcePath();
  try {
    const raw = await fs.readFile(source, "utf8");
    _cache = JSON.parse(raw) as AgentKnowledge;
    return _cache;
  } catch (err) {
    if (!_warned) {
      log.warn(
        { err, source },
        "agent-knowledge.json missing or unparseable — falling back to empty knowledge",
      );
      _warned = true;
    }
    _cache = EMPTY_KNOWLEDGE;
    return _cache;
  }
}

// ── Search ───────────────────────────────────────────────────────────────────

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

export async function searchSiteContent(
  query: string,
  opts: SearchOptions = {},
): Promise<SiteSearchResult[]> {
  const { maxResults = 8 } = opts;
  const knowledge = await loadAgentKnowledge();
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

// ── Read ─────────────────────────────────────────────────────────────────────

export interface SiteNote {
  id: string;
  title: string;
  slug: string;
  kind: AgentDocument["kind"];
  url: string;
  summary: string;
  tags: string[];
  frontmatter: Record<string, unknown>;
  body: string;
  wikilinks: string[];
  related: string[];
  headings: Array<{ depth: number; text: string }>;
}

function normalizeKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, "-");
}

export async function readSiteNote(
  nameOrIdOrSlug: string,
): Promise<SiteNote | null> {
  const knowledge = await loadAgentKnowledge();
  if (knowledge.documents.length === 0) return null;

  const key = normalizeKey(nameOrIdOrSlug);

  const byExact = knowledge.documents.find((d) => d.id === nameOrIdOrSlug);
  if (byExact) return toSiteNote(byExact);

  const bySlug = knowledge.documents.find((d) => d.slug === key);
  if (bySlug) return toSiteNote(bySlug);

  const byTitle = knowledge.documents.find(
    (d) =>
      normalizeKey(d.title) === key ||
      d.title.toLowerCase() === nameOrIdOrSlug.toLowerCase(),
  );
  if (byTitle) return toSiteNote(byTitle);

  return null;
}

function toSiteNote(d: AgentDocument): SiteNote {
  return {
    id: d.id,
    title: d.title,
    slug: d.slug,
    kind: d.kind,
    url: d.url,
    summary: d.summary,
    tags: d.tags,
    frontmatter: d.frontmatter,
    body: d.body,
    wikilinks: d.wikilinks,
    related: d.related,
    headings: d.headings,
  };
}

// ── Traverse ─────────────────────────────────────────────────────────────────

export interface TraverseOptions {
  edgeTypes?: AgentGraphEdgeType[];
  depth?: 1 | 2;
  maxNeighbors?: number;
}

export interface Neighbor {
  node: AgentGraphNode;
  edgeType: AgentGraphEdgeType;
  hops: 1 | 2;
}

export interface TraverseResult {
  seed: AgentGraphNode | null;
  neighbors: Neighbor[];
}

export async function traverseFrom(
  seedKey: string,
  opts: TraverseOptions = {},
): Promise<TraverseResult> {
  const {
    edgeTypes = ["wikilink", "reference", "tag"],
    depth = 1,
    maxNeighbors = 10,
  } = opts;
  const knowledge = await loadAgentKnowledge();
  if (knowledge.graph.nodes.length === 0) return { seed: null, neighbors: [] };

  const nodeById = new Map(knowledge.graph.nodes.map((n) => [n.id, n]));

  // Resolve seed: accept id, slug, title, or tag name.
  const seed =
    nodeById.get(seedKey) ??
    nodeById.get(`tag:${seedKey}`) ??
    knowledge.graph.nodes.find(
      (n) => n.label.toLowerCase() === seedKey.toLowerCase(),
    ) ??
    knowledge.graph.nodes.find((n) =>
      n.id.endsWith(`/${normalizeKey(seedKey)}`),
    ) ??
    null;

  if (!seed) return { seed: null, neighbors: [] };

  const allowedEdgeTypes = new Set(edgeTypes);
  const visited = new Set<string>([seed.id]);
  const neighbors: Neighbor[] = [];

  const hop1: Array<{ id: string; type: AgentGraphEdgeType }> = [];
  for (const link of knowledge.graph.links) {
    if (!allowedEdgeTypes.has(link.type)) continue;
    // Always follow source → target direction.
    if (link.source === seed.id && !visited.has(link.target)) {
      hop1.push({ id: link.target, type: link.type });
    }
    // For tag edges also follow target → source (tags fan out from content nodes
    // to tag nodes, so traversal from a tag node must go "backwards").
    if (
      link.type === "tag" &&
      link.target === seed.id &&
      !visited.has(link.source)
    ) {
      hop1.push({ id: link.source, type: link.type });
    }
  }

  for (const { id, type } of hop1) {
    if (visited.has(id)) continue;
    visited.add(id);
    const node = nodeById.get(id);
    if (!node) continue;
    neighbors.push({ node, edgeType: type, hops: 1 });
    if (neighbors.length >= maxNeighbors) break;
  }

  if (depth === 2 && neighbors.length < maxNeighbors) {
    const level1Ids = neighbors.map((n) => n.node.id);
    for (const link of knowledge.graph.links) {
      if (!allowedEdgeTypes.has(link.type)) continue;
      for (const parentId of level1Ids) {
        let nextId: string | null = null;
        // Always follow source → target.
        if (link.source === parentId && !visited.has(link.target)) {
          nextId = link.target;
        }
        // For tag edges also follow target → source.
        if (
          !nextId &&
          link.type === "tag" &&
          link.target === parentId &&
          !visited.has(link.source)
        ) {
          nextId = link.source;
        }
        if (!nextId) continue;
        visited.add(nextId);
        const node = nodeById.get(nextId);
        if (!node) continue;
        neighbors.push({ node, edgeType: link.type, hops: 2 });
        if (neighbors.length >= maxNeighbors) break;
      }
      if (neighbors.length >= maxNeighbors) break;
    }
  }

  return { seed, neighbors };
}
