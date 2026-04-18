/**
 * Shared types for the agent knowledge graph.
 *
 * The build-time `generate-agent-knowledge.ts` script emits a single
 * JSON blob at `public/agent-knowledge.json` that matches this shape.
 * The runtime loader in `site-content.ts` reads and caches it.
 */

export type ContentKind = "notes" | "projects" | "writing" | "prompts";

export interface AgentDocument {
  /** Stable id: `"{kind}/{slug}"` — also used as graph node id. */
  id: string;
  kind: ContentKind;
  slug: string;
  title: string;
  summary: string;
  /** Site URL path, e.g. `/writing/agent-native-architecture`. */
  url: string;
  tags: string[];
  frontmatter: Record<string, unknown>;
  /** MDX body with JSX stripped to plain text. */
  body: string;
  /** Normalized wikilink targets (slug-form). */
  wikilinks: string[];
  /** Frontmatter `related:` slugs, normalized. */
  related: string[];
  headings: Array<{ depth: number; text: string }>;
  wordCount: number;
}

export type GraphNodeType =
  | ContentKind
  | "tag"
  | "skill";

export interface AgentGraphNode {
  id: string;
  label: string;
  type: GraphNodeType;
  url?: string;
  summary?: string;
  tags: string[];
  val: number;
}

export type AgentGraphEdgeType = "wikilink" | "reference" | "tag";

export interface AgentGraphEdge {
  source: string;
  target: string;
  type: AgentGraphEdgeType;
}

export interface AgentKnowledge {
  generatedAt: string;
  commit: string;
  documents: AgentDocument[];
  graph: {
    nodes: AgentGraphNode[];
    links: AgentGraphEdge[];
  };
  /** term → array of document ids; lowercased terms. */
  invertedIndex: Record<string, string[]>;
}
