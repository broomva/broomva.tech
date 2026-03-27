/**
 * Public knowledge graph builder — BRO-230
 *
 * Reads all static content (notes, projects, writing, prompts) and the
 * bstack skills catalog, then constructs a GraphData structure with:
 *   - One node per content document
 *   - One node per unique tag
 *   - One node per skill
 *   - Edges: tag→doc (shared tags), wikilinks between docs, explicit `links:`
 */

import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { BSTACK_LAYERS } from "@/lib/skills-data";
import type { GraphData, GraphLink, GraphNode, NodeType } from "./types";

// ─── Wikilink extraction ────────────────────────────────────────────────────

/**
 * Extract all `[[target]]` and `[[target|alias]]` wikilinks from markdown.
 * Returns the target slug (lowercased, whitespace collapsed).
 */
export function extractWikilinks(markdown: string): string[] {
  const matches = [...markdown.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)];
  return matches.map((m) => m[1].trim().toLowerCase().replace(/\s+/g, "-"));
}

// ─── Content reading ────────────────────────────────────────────────────────

type ContentKind = "notes" | "projects" | "writing" | "prompts";

const CONTENT_ROOT = path.join(process.cwd(), "content");

const KIND_ROUTES: Record<ContentKind, string> = {
  notes: "/notes",
  projects: "/projects",
  writing: "/writing",
  prompts: "/prompts",
};

interface ParsedDoc {
  slug: string;
  kind: ContentKind;
  title: string;
  summary: string;
  tags: string[];
  links: string[]; // extracted external link labels / internal refs
  related: string[]; // explicit frontmatter related slugs
  wikilinks: string[];
  published: boolean;
}

async function readKind(kind: ContentKind): Promise<ParsedDoc[]> {
  const dir = path.join(CONTENT_ROOT, kind);
  let files: string[];
  try {
    files = await fs.readdir(dir);
  } catch {
    return [];
  }

  const docs: ParsedDoc[] = [];
  for (const file of files) {
    if (!/\.(md|mdx)$/.test(file)) continue;
    const slug = file.replace(/\.(md|mdx)$/, "");
    let raw: string;
    try {
      raw = await fs.readFile(path.join(dir, file), "utf8");
    } catch {
      continue;
    }
    const { data, content } = matter(raw);
    if (data.published === false) continue;

    const tags: string[] = Array.isArray(data.tags)
      ? data.tags.filter((t): t is string => typeof t === "string")
      : [];

    const links: string[] = Array.isArray(data.links)
      ? data.links
          .filter(
            (l): l is { label: string; url: string } =>
              typeof l?.label === "string",
          )
          .map((l) => l.label)
      : [];

    // `related` is an array of sibling slugs declared in frontmatter
    // e.g.  related: [harness-over-prompting, release-rhythm]
    const related: string[] = Array.isArray(data.related)
      ? data.related.filter((r): r is string => typeof r === "string")
      : [];

    docs.push({
      slug,
      kind,
      title: typeof data.title === "string" ? data.title : slug,
      summary: typeof data.summary === "string" ? data.summary : "",
      tags,
      links,
      related,
      wikilinks: extractWikilinks(content),
      published: true,
    });
  }
  return docs;
}

// ─── Graph builder ───────────────────────────────────────────────────────────

export async function buildPublicGraph(): Promise<GraphData> {
  "use cache";
  const kinds: ContentKind[] = ["notes", "projects", "writing", "prompts"];
  const allDocs = (await Promise.all(kinds.map(readKind))).flat();

  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];

  // Track tag usage to compute tag node sizes
  const tagUsage: Map<string, number> = new Map();
  // Maps slug → node id for wikilink resolution (also populated with titles)
  const slugToId: Map<string, string> = new Map();

  // ── Content nodes ────────────────────────────────────────────────────────
  for (const doc of allDocs) {
    const nodeId = `${doc.kind}:${doc.slug}`;
    slugToId.set(doc.slug, nodeId);
    // Also index by title (lowercased, slug-form) for wikilink resolution
    slugToId.set(doc.title.toLowerCase().replace(/\s+/g, "-"), nodeId);
    slugToId.set(doc.title.toLowerCase(), nodeId);

    const node: GraphNode = {
      id: nodeId,
      label: doc.title,
      type: doc.kind as NodeType,
      url: `${KIND_ROUTES[doc.kind]}/${doc.slug}`,
      summary: doc.summary,
      tags: doc.tags,
      val: 1,
      public: true,
    };
    nodes.push(node);

    for (const tag of doc.tags) {
      tagUsage.set(tag, (tagUsage.get(tag) ?? 0) + 1);
    }
  }

  // ── Skill nodes ──────────────────────────────────────────────────────────
  for (const layer of BSTACK_LAYERS) {
    for (const skill of layer.skills) {
      const nodeId = `skill:${skill.slug}`;
      slugToId.set(skill.slug, nodeId);

      nodes.push({
        id: nodeId,
        label: skill.name,
        type: "skill",
        url: skill.skillsUrl,
        summary: skill.description,
        tags: [layer.id],
        val: 1,
        public: true,
      });

      tagUsage.set(layer.id, (tagUsage.get(layer.id) ?? 0) + 1);
    }
  }

  // ── Tag nodes ────────────────────────────────────────────────────────────
  for (const [tag, count] of tagUsage) {
    nodes.push({
      id: `tag:${tag}`,
      label: tag,
      type: "tag",
      val: count,
      public: true,
    });
  }

  // ── Tag → doc edges ──────────────────────────────────────────────────────
  for (const doc of allDocs) {
    for (const tag of doc.tags) {
      links.push({
        source: `${doc.kind}:${doc.slug}`,
        target: `tag:${tag}`,
        type: "tag",
      });
    }
  }

  // ── Skill → tag edges ────────────────────────────────────────────────────
  for (const layer of BSTACK_LAYERS) {
    for (const skill of layer.skills) {
      links.push({
        source: `skill:${skill.slug}`,
        target: `tag:${layer.id}`,
        type: "tag",
      });
    }
  }

  // ── Edge deduplication helper ────────────────────────────────────────────
  const seenEdges = new Set<string>();
  function addEdge(source: string, target: string, type: GraphLink["type"]) {
    const key = [source, target].sort().join("|");
    if (seenEdges.has(key)) return;
    seenEdges.add(key);
    links.push({ source, target, type });
  }

  // ── Wikilink edges ───────────────────────────────────────────────────────
  for (const doc of allDocs) {
    const sourceId = `${doc.kind}:${doc.slug}`;
    for (const wl of doc.wikilinks) {
      const targetId = slugToId.get(wl);
      if (targetId && targetId !== sourceId) {
        addEdge(sourceId, targetId, "wikilink");
      }
    }
  }

  // ── Explicit `related:` frontmatter edges (Obsidian relationships) ──────
  for (const doc of allDocs) {
    const sourceId = `${doc.kind}:${doc.slug}`;
    for (const rel of doc.related) {
      // Strip wikilink brackets if present: [[slug]] → slug
      const normalised = rel.replace(/^\[\[|\]\]$/g, "").trim().toLowerCase().replace(/\s+/g, "-");
      const targetId = slugToId.get(normalised);
      if (targetId && targetId !== sourceId) {
        addEdge(sourceId, targetId, "reference");
      }
    }
  }

  // ── Degree-weight node sizes ─────────────────────────────────────────────
  const degree: Map<string, number> = new Map();
  for (const link of links) {
    degree.set(link.source, (degree.get(link.source) ?? 0) + 1);
    degree.set(link.target, (degree.get(link.target) ?? 0) + 1);
  }
  for (const node of nodes) {
    node.val = Math.max(1, degree.get(node.id) ?? 1);
  }

  return { nodes, links, generatedAt: new Date().toISOString() };
}
