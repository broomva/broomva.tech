/**
 * Knowledge graph types — shared between public and user graph layers.
 *
 * Public node types are derived from the static content corpus (notes,
 * projects, writing, prompts, skills, tags). Authenticated node types
 * overlay per-user data from Lago (memories, conversations, artifacts).
 */

export type PublicNodeType =
  | "note"
  | "project"
  | "writing"
  | "prompt"
  | "skill"
  | "tag";

export type UserNodeType = "memory" | "conversation" | "artifact";

export type NodeType = PublicNodeType | UserNodeType;

export interface GraphNode {
  /** Unique stable ID — e.g. "note:harness-over-prompting" or "tag:agents" */
  id: string;
  /** Display label */
  label: string;
  type: NodeType;
  /** Link to the page for this node (if applicable) */
  url?: string;
  /** Summary / description */
  summary?: string;
  /** Tags associated with this node */
  tags?: string[];
  /**
   * Node size weight — typically the degree (number of edges).
   * react-force-graph uses `val` to scale node radius.
   */
  val: number;
  /** Whether this node is part of the public (unauthenticated) layer */
  public: boolean;
}

export type LinkType = "wikilink" | "tag" | "reference" | "conversation";

export interface GraphLink {
  source: string;
  target: string;
  type: LinkType;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
  generatedAt?: string;
}
