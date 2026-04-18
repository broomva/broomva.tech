/**
 * Build-time script: emits public/agent-knowledge.json for the Arcan chat.
 *
 * Sources: every MDX under content/{writing,notes,projects,prompts}.
 * For each document it captures: body (JSX stripped), frontmatter, tags,
 * wikilinks, related, headings, wordCount — plus a graph view (nodes + edges)
 * and an inverted term index.
 *
 * Usage:  bun scripts/generate-agent-knowledge.ts
 * Wired:  prebuild hook + vercel.json buildCommand.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { execSync } from "node:child_process";
import matter from "gray-matter";
import type {
  AgentDocument,
  AgentGraphEdge,
  AgentGraphEdgeType,
  AgentGraphNode,
  AgentKnowledge,
  ContentKind,
} from "../lib/ai/knowledge/types";

const CONTENT_ROOT = path.join(process.cwd(), "content");
const KINDS: ContentKind[] = ["writing", "notes", "projects", "prompts"];
const KIND_ROUTES: Record<ContentKind, string> = {
  writing: "/writing",
  notes: "/notes",
  projects: "/projects",
  prompts: "/prompts",
};

// ── Wikilink + heading extraction ────────────────────────────────────────────

function extractWikilinks(markdown: string): string[] {
  const matches = [...markdown.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)];
  return matches.map((m) => m[1].trim().toLowerCase().replace(/\s+/g, "-"));
}

function extractHeadings(markdown: string): Array<{ depth: number; text: string }> {
  const lines = markdown.split("\n");
  const headings: Array<{ depth: number; text: string }> = [];
  for (const line of lines) {
    const m = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (m) headings.push({ depth: m[1].length, text: m[2] });
  }
  return headings;
}

/**
 * Strip MDX JSX to plain text; keep markdown prose AND code fences intact.
 * The JSX strip patterns are applied only to non-fenced segments so that
 * Python `import`, HTML-looking snippets in docs, etc. are preserved.
 */
function stripJsx(md: string): string {
  // Split on triple-backtick fences. Capturing group preserves them.
  // Indices: 0 = outside, 1 = fence content (including fences), 2 = outside, ...
  const parts = md.split(/(```[\s\S]*?```)/g);

  for (let i = 0; i < parts.length; i++) {
    // Only transform non-fence segments (even indices after split with capture)
    if (i % 2 === 1) continue; // this is a fence block — leave as-is

    parts[i] = parts[i]
      // Strip JSX import/export lines (top-level only — fences are protected above)
      .replace(/^(import|export)\s[^\n]*$/gm, "")
      // Strip self-closing JSX tags: <Foo bar="x" />
      .replace(/<[A-Z][\w.]*[^>]*\/>/g, "")
      // Strip paired JSX: <Foo>...</Foo>
      .replace(/<([A-Z][\w.]*)[^>]*>[\s\S]*?<\/\1>/g, "");
  }

  return parts
    .join("")
    // Collapse excess blank lines
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function wordCount(text: string): number {
  const words = text.replace(/[^\p{L}\p{N}\s]/gu, " ").trim().split(/\s+/);
  return words.filter(Boolean).length;
}

// ── Per-kind reader ──────────────────────────────────────────────────────────

async function readKind(kind: ContentKind): Promise<AgentDocument[]> {
  const dir = path.join(CONTENT_ROOT, kind);
  let files: string[];
  try {
    files = await fs.readdir(dir);
  } catch {
    return [];
  }

  const docs: AgentDocument[] = [];
  for (const file of files) {
    if (!/\.(md|mdx)$/.test(file)) continue;
    const slug = file.replace(/\.(md|mdx)$/, "");
    const raw = await fs.readFile(path.join(dir, file), "utf8");
    const parsed = matter(raw);
    if (parsed.data.published === false) continue;

    const tags: string[] = Array.isArray(parsed.data.tags)
      ? parsed.data.tags.filter((t: unknown): t is string => typeof t === "string")
      : [];
    const related: string[] = Array.isArray(parsed.data.related)
      ? parsed.data.related
          .filter((r: unknown): r is string => typeof r === "string")
          .map((r) =>
            r.replace(/^\[\[|\]\]$/g, "").trim().toLowerCase().replace(/\s+/g, "-"),
          )
      : [];

    const body = stripJsx(parsed.content);

    docs.push({
      id: `${kind}/${slug}`,
      kind,
      slug,
      title: typeof parsed.data.title === "string" ? parsed.data.title : slug,
      summary: typeof parsed.data.summary === "string" ? parsed.data.summary : "",
      url: `${KIND_ROUTES[kind]}/${slug}`,
      tags,
      frontmatter: parsed.data,
      body,
      wikilinks: extractWikilinks(parsed.content),
      related,
      headings: extractHeadings(parsed.content),
      wordCount: wordCount(body),
    });
  }
  return docs;
}

// ── Graph builder ────────────────────────────────────────────────────────────

function buildGraph(docs: AgentDocument[]): { nodes: AgentGraphNode[]; links: AgentGraphEdge[] } {
  const nodes: AgentGraphNode[] = [];
  const links: AgentGraphEdge[] = [];
  const slugToId = new Map<string, string>();
  const tagUsage = new Map<string, number>();

  for (const doc of docs) {
    slugToId.set(doc.slug, doc.id);
    slugToId.set(doc.title.toLowerCase().replace(/\s+/g, "-"), doc.id);
    slugToId.set(doc.title.toLowerCase(), doc.id);

    nodes.push({
      id: doc.id,
      label: doc.title,
      type: doc.kind,
      url: doc.url,
      summary: doc.summary,
      tags: doc.tags,
      val: 1,
    });

    for (const tag of doc.tags) tagUsage.set(tag, (tagUsage.get(tag) ?? 0) + 1);
  }

  for (const [tag, count] of tagUsage) {
    nodes.push({ id: `tag:${tag}`, label: tag, type: "tag", tags: [], val: count });
  }

  const seen = new Set<string>();
  const addEdge = (source: string, target: string, type: AgentGraphEdgeType) => {
    const key = [source, target, type].sort().join("|");
    if (seen.has(key)) return;
    seen.add(key);
    links.push({ source, target, type });
  };

  for (const doc of docs) {
    for (const tag of doc.tags) addEdge(doc.id, `tag:${tag}`, "tag");
    for (const wl of doc.wikilinks) {
      const target = slugToId.get(wl);
      if (target && target !== doc.id) addEdge(doc.id, target, "wikilink");
    }
    for (const rel of doc.related) {
      const target = slugToId.get(rel);
      if (target && target !== doc.id) addEdge(doc.id, target, "reference");
    }
  }

  // Degree-weight node sizes
  const degree = new Map<string, number>();
  for (const l of links) {
    degree.set(l.source, (degree.get(l.source) ?? 0) + 1);
    degree.set(l.target, (degree.get(l.target) ?? 0) + 1);
  }
  for (const n of nodes) n.val = Math.max(1, degree.get(n.id) ?? 1);

  return { nodes, links };
}

// ── Inverted index ───────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  "the","a","an","and","or","but","of","to","in","on","at","for","is","are",
  "was","were","be","been","being","this","that","these","those","it","its",
  "i","you","he","she","we","they","as","by","with","from","up","about",
  "into","over","after","not","no","so","if","then","than","can","will","would",
  "should","could","may","might","must","do","does","did","have","has","had",
]);

function buildInvertedIndex(docs: AgentDocument[]): Record<string, string[]> {
  const index: Record<string, Set<string>> = {};
  for (const doc of docs) {
    const haystack = `${doc.title} ${doc.summary} ${doc.body} ${doc.tags.join(" ")}`.toLowerCase();
    const terms = haystack.match(/[\p{L}\p{N}]{3,}/gu) ?? [];
    for (const term of terms) {
      if (STOP_WORDS.has(term)) continue;
      if (!index[term]) index[term] = new Set();
      index[term].add(doc.id);
    }
  }
  const out: Record<string, string[]> = {};
  for (const [term, set] of Object.entries(index)) out[term] = [...set];
  return out;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("Generating agent knowledge index…");

  const docsByKind = await Promise.all(KINDS.map(readKind));
  const docs = docsByKind.flat();

  const graph = buildGraph(docs);
  const invertedIndex = buildInvertedIndex(docs);

  let commit = "unknown";
  try {
    commit = execSync("git rev-parse HEAD", { cwd: process.cwd() }).toString().trim();
  } catch {
    // not a git checkout — keep "unknown"
  }

  const knowledge: AgentKnowledge = {
    generatedAt: new Date().toISOString(),
    commit,
    documents: docs,
    graph,
    invertedIndex,
  };

  const outPath = path.join(process.cwd(), "public", "agent-knowledge.json");
  const json = JSON.stringify(knowledge);
  await fs.writeFile(outPath, json, "utf8");

  const bytes = Buffer.byteLength(json, "utf8");
  console.log(
    `  ✓ ${docs.length} documents, ${graph.nodes.length} graph nodes, ${graph.links.length} edges, ${Object.keys(invertedIndex).length} index terms (${(bytes / 1024).toFixed(1)} KB) → public/agent-knowledge.json`,
  );
}

main().catch((err) => {
  console.error("Agent knowledge generation failed:", err);
  process.exit(1);
});
