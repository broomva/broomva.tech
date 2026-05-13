import type { SceneNode } from "@broomva/prosopon";
import type { ComponentType } from "react";
import { GenericToolCard } from "./tool-cards/GenericToolCard";

interface Props {
  node: SceneNode;
  sid?: string;
}

/**
 * Sub-dispatcher for tool_call intents. B-4a registers only the
 * GenericToolCard fallback. B-4b extends TOOL_MAP with typed cards
 * (FileWriteCard, BashCard, ...).
 *
 * Lookup uses the canonical `intent.name` (Prosopon `Intent::ToolCall`)
 * with a fallback to the plan-shaped `intent.tool`.
 */
const TOOL_MAP: Record<string, ComponentType<Props>> = {
  // B-4b will add entries here:
  // "fs.read": FileReadCard,
  // "fs.write": FileWriteCard,
  // "fs.list":  TreeCard,
  // "fs.search": SearchResultsCard,
  // "fs.apply_patch": PatchCard,
  // "memory.query": MemoryQueryCard,
  // "memory.write": MemoryWriteCard,
  // "bash":  BashCard,
};

export function ToolCallIntent({ node, sid }: Props) {
  const intent = node.intent as {
    type?: "tool_call";
    kind?: "tool_call";
    name?: string;
    tool?: string;
  };
  const toolName = intent.name ?? intent.tool ?? "";
  const Component = TOOL_MAP[toolName] ?? GenericToolCard;
  return <Component node={node} sid={sid} />;
}
