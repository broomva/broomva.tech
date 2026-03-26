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

    docs.push({
      slug,
      kind,
      title: typeof data.title === "string" ? data.title : slug,
      summary: typeof data.summary === "string" ? data.summary : "",
      tags,
      links,
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
  // Maps slug → node id for wikilink resolution
  const slugToId: Map<string, string> = new Map();

  // ── Content nodes ────────────────────────────────────────────────────────
  for (const doc of allDocs) {
    const nodeId = `${doc.kind}:${doc.slug}`;
    slugToId.set(doc.slug, nodeId);

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

  // ── Wikilink edges ───────────────────────────────────────────────────────
  for (const doc of allDocs) {
    const sourceId = `${doc.kind}:${doc.slug}`;
    for (const wl of doc.wikilinks) {
      const targetId = slugToId.get(wl);
      if (targetId && targetId !== sourceId) {
        links.push({ source: sourceId, target: targetId, type: "wikilink" });
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
