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
import {
  type SearchOptions,
  type SiteSearchResult,
  searchKnowledge,
} from "./search";
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

/**
 * Candidate filesystem paths to try (in order), to be robust across:
 *   • local dev (CWD = apps/broomva)
 *   • monorepo dev (CWD = repo root)
 *   • Vercel serverless runtime (CWD = /var/task, with outputFileTracingIncludes)
 */
function candidateFilesystemPaths(): string[] {
  return [
    path.join(process.cwd(), "public", "agent-knowledge.json"),
    path.join(process.cwd(), "apps", "broomva", "public", "agent-knowledge.json"),
    // Module-relative fallback (webpack will rewrite __dirname at build)
    path.join(__dirname, "..", "..", "..", "public", "agent-knowledge.json"),
  ];
}

/** Resolve the self-origin URL for fetch-based loading (production fallback). */
function selfOriginUrl(): string | null {
  // Explicit override (set in env or future build-time config)
  const explicit = process.env.AGENT_KNOWLEDGE_URL;
  if (explicit) return explicit;

  // Vercel sets VERCEL_URL to the deployment's own domain (without protocol)
  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl) return `https://${vercelUrl}/agent-knowledge.json`;

  // Production site URL if exposed
  const siteUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL;
  if (siteUrl) return `${siteUrl.replace(/\/$/, "")}/agent-knowledge.json`;

  return null;
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

async function readFromFilesystem(paths: string[]): Promise<{ raw: string; path: string } | null> {
  for (const p of paths) {
    try {
      const raw = await fs.readFile(p, "utf8");
      return { raw, path: p };
    } catch {
      // try next candidate
    }
  }
  return null;
}

async function readFromFetch(url: string): Promise<{ raw: string; path: string } | null> {
  try {
    const res = await fetch(url, { cache: "force-cache" });
    if (!res.ok) return null;
    const raw = await res.text();
    return { raw, path: url };
  } catch {
    return null;
  }
}

export async function loadAgentKnowledge(): Promise<AgentKnowledge> {
  if (_cache) return _cache;

  // Test override: a single explicit path, no fallbacks.
  if (_sourcePath) {
    try {
      const raw = await fs.readFile(_sourcePath, "utf8");
      _cache = JSON.parse(raw) as AgentKnowledge;
      return _cache;
    } catch (err) {
      if (!_warned) {
        log.warn({ err, source: _sourcePath }, "test source unreadable");
        _warned = true;
      }
      _cache = EMPTY_KNOWLEDGE;
      return _cache;
    }
  }

  // Production/dev: try filesystem candidates first, then fall back to fetch.
  const fsPaths = candidateFilesystemPaths();
  let loaded = await readFromFilesystem(fsPaths);

  if (!loaded) {
    const url = selfOriginUrl();
    if (url) loaded = await readFromFetch(url);
  }

  if (loaded) {
    try {
      _cache = JSON.parse(loaded.raw) as AgentKnowledge;
      log.debug({ source: loaded.path, docs: _cache.documents.length }, "agent-knowledge loaded");
      return _cache;
    } catch (err) {
      if (!_warned) {
        log.warn({ err, source: loaded.path }, "agent-knowledge parse failed");
        _warned = true;
      }
    }
  }

  if (!_warned) {
    log.warn(
      { cwd: process.cwd(), fsPaths, fetchUrl: selfOriginUrl() },
      "agent-knowledge.json unreachable via filesystem or fetch — falling back to empty knowledge",
    );
    _warned = true;
  }
  _cache = EMPTY_KNOWLEDGE;
  return _cache;
}

// ── Search ───────────────────────────────────────────────────────────────────

export type { SearchOptions, SiteSearchResult } from "./search";

export async function searchSiteContent(
  query: string,
  opts: SearchOptions = {},
): Promise<SiteSearchResult[]> {
  return searchKnowledge(await loadAgentKnowledge(), query, opts);
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
