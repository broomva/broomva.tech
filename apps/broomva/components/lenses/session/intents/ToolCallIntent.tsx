import type { SceneNode } from "@broomva/prosopon";
import type { ComponentType } from "react";
import { BashCard } from "./tool-cards/BashCard";
import { FileReadCard } from "./tool-cards/FileReadCard";
import { FileWriteCard } from "./tool-cards/FileWriteCard";
import { GenericToolCard } from "./tool-cards/GenericToolCard";
import { MemoryQueryCard } from "./tool-cards/MemoryQueryCard";
import { MemoryWriteCard } from "./tool-cards/MemoryWriteCard";
import { PatchCard } from "./tool-cards/PatchCard";
import { SearchResultsCard } from "./tool-cards/SearchResultsCard";
import { TreeCard } from "./tool-cards/TreeCard";

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
  "fs.read": FileReadCard,
  "fs.write": FileWriteCard,
  "fs.list": TreeCard,
  "fs.search": SearchResultsCard,
  "fs.apply_patch": PatchCard,
  "memory.query": MemoryQueryCard,
  "memory.write": MemoryWriteCard,
  bash: BashCard,
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
