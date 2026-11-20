import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { AgentKnowledge } from "@/lib/ai/knowledge/types";
import { createModuleLogger } from "@/lib/logger";

const log = createModuleLogger("twin:knowledge");

const EMPTY: AgentKnowledge = {
  generatedAt: "1970-01-01T00:00:00.000Z",
  commit: "unknown",
  documents: [],
  graph: { nodes: [], links: [] },
  invertedIndex: {},
};

let cache: Promise<AgentKnowledge> | null = null;

/**
 * public/agent-knowledge.json, built from content/ at deploy time.
 *
 * The path is fully static on purpose: Turbopack traces exactly this file
 * into the /api/ask function (next.config.ts also lists it). A dynamic path,
 * like lib/ai/knowledge/site-content.ts uses, makes it trace the whole
 * project, ~68 MB of public/ media included. Missing or unreadable → empty
 * knowledge and one warning; the double still answers from its brief.
 */
export function loadTwinKnowledge(): Promise<AgentKnowledge> {
  cache ??= readFile(
    path.join(process.cwd(), "public", "agent-knowledge.json"),
    "utf8",
  )
    .then((raw) => JSON.parse(raw) as AgentKnowledge)
    .catch((err: unknown) => {
      log.warn(
        { err },
        "agent-knowledge.json unavailable; answering from the brief only",
      );
      return EMPTY;
    });
  return cache;
}
