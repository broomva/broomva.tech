import "server-only";

import fs from "node:fs/promises";
import path from "node:path";

import matter from "gray-matter";

import {
  type ContentKind,
  extractWikilinks,
  getContentList,
} from "@/lib/content";
import { BSTACK_LAYERS } from "@/lib/skills-data";

const CONTENT_ROOT = path.join(process.cwd(), "content");

export type NodeType = "note" | "project" | "writing" | "prompt" | "skill" | "tag";

export interface GraphNode {
  id: string;
  label: string;
  type: NodeType;
  url?: string;
  tags?: string[];
  val: number;
}

export interface GraphLink {
  source: string;
  target: string;
  type: "wikilink" | "tag" | "reference";
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

const CONTENT_KINDS: ContentKind[] = ["notes", "projects", "writing", "prompts"];

const KIND_TO_NODE_TYPE: Record<ContentKind, NodeType> = {
  notes: "note",
  projects: "project",
  writing: "writing",
  prompts: "prompt",
};

export async function buildPublicGraph(): Promise<GraphData> {
  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];

  // Map from slug/label (lowercased) to node id for wikilink resolution
  const slugToId = new Map<string, string>();
  const labelToId = new Map<string, string>();

  // Collect wikilinks per node id
  const wikilinksPerNode = new Map<string, string[]>();

  // 1. Build content nodes
  for (const kind of CONTENT_KINDS) {
    const items = await getContentList(kind);
    for (const item of items) {
      const nodeId = `${kind}:${item.slug}`;
      const nodeType = KIND_TO_NODE_TYPE[kind];

      nodes.push({
        id: nodeId,
        label: item.title,
        type: nodeType,
        url: `/${kind}/${item.slug}`,
        tags: item.tags,
        val: 1,
      });

      slugToId.set(item.slug.toLowerCase(), nodeId);
      labelToId.set(item.title.toLowerCase(), nodeId);

      // Read raw markdown directly to avoid running the full remark pipeline twice
      const rawPath = path.join(CONTENT_ROOT, kind, `${item.slug}.mdx`);
      const raw = await fs.readFile(rawPath, "utf8").catch(() => null);
      const rawContent = raw ? matter(raw).content : "";
      const wikilinks = extractWikilinks(rawContent);
      if (wikilinks.length > 0) {
        wikilinksPerNode.set(nodeId, wikilinks);
      }
    }
  }

  // 2. Build skill nodes
  for (const layer of BSTACK_LAYERS) {
    for (const skill of layer.skills) {
      const nodeId = `skill:${skill.slug}`;
      nodes.push({
        id: nodeId,
        label: skill.name,
        type: "skill",
        url: skill.skillsUrl,
        val: 1,
      });
      slugToId.set(skill.slug.toLowerCase(), nodeId);
      labelToId.set(skill.name.toLowerCase(), nodeId);
    }
  }

  // 3. Resolve wikilink edges
  const seenEdges = new Set<string>();
  for (const [sourceId, targets] of wikilinksPerNode) {
    for (const target of targets) {
      const lower = target.toLowerCase();
      const resolvedId = slugToId.get(lower) ?? labelToId.get(lower);
      if (resolvedId && resolvedId !== sourceId) {
        const edgeKey = `${sourceId}|${resolvedId}`;
        if (!seenEdges.has(edgeKey)) {
          seenEdges.add(edgeKey);
          links.push({ source: sourceId, target: resolvedId, type: "wikilink" });
        }
      }
    }
  }

  // 4. Tag co-occurrence edges
  // Build tag → list of node ids that have that tag
  const tagToNodeIds = new Map<string, string[]>();
  for (const node of nodes) {
    if (!node.tags) continue;
    for (const tag of node.tags) {
      const normalizedTag = tag.toLowerCase();
      const existing = tagToNodeIds.get(normalizedTag);
      if (existing) {
        existing.push(node.id);
      } else {
        tagToNodeIds.set(normalizedTag, [node.id]);
      }
    }
  }

  for (const [tag, nodeIds] of tagToNodeIds) {
    if (nodeIds.length < 2) continue;

    // Create tag node
    const tagNodeId = `tag:${tag}`;
    nodes.push({
      id: tagNodeId,
      label: tag,
      type: "tag",
      val: 1,
    });

    // Create edges from each doc to the tag node
    for (const nodeId of nodeIds) {
      links.push({ source: nodeId, target: tagNodeId, type: "tag" });
    }
  }

  // 5. Compute degree and update val for each node
  const degree = new Map<string, number>();
  for (const link of links) {
    degree.set(link.source, (degree.get(link.source) ?? 0) + 1);
    degree.set(link.target, (degree.get(link.target) ?? 0) + 1);
  }

  for (const node of nodes) {
    node.val = Math.max(1, degree.get(node.id) ?? 0);
  }

  return { nodes, links };
}
