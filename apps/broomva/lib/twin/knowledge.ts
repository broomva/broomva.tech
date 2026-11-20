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
 * Where the build-generated file can sit inside the function. Each path is
 * written out in full so Turbopack traces exactly this file (a dynamic path,
 * as lib/ai/knowledge/site-content.ts uses, makes it trace the whole project,
 * ~68 MB of public/ media included). Two candidates because the function's
 * cwd differs by layout: the app directory locally, the repo root in
 * Vercel's monorepo functions. A single cwd/public path returned nothing in
 * production in April (fa2bf47). next.config.ts also lists the file under
 * outputFileTracingIncludes for /api/ask.
 */
export function knowledgeCandidates(cwd: string = process.cwd()): string[] {
  return [
    path.join(cwd, "public", "agent-knowledge.json"),
    path.join(cwd, "apps", "broomva", "public", "agent-knowledge.json"),
  ];
}

async function readFirst(paths: string[]): Promise<AgentKnowledge | null> {
  for (const p of paths) {
    try {
      const knowledge = JSON.parse(await readFile(p, "utf8")) as AgentKnowledge;
      log.info(
        { source: p, docs: knowledge.documents.length },
        "agent-knowledge loaded",
      );
      return knowledge;
    } catch {
      // try the next candidate
    }
  }
  return null;
}

/**
 * public/agent-knowledge.json, built from content/ at deploy time. Missing
 * everywhere → empty knowledge and one warning naming every path tried; the
 * double still answers from its brief, and GET /api/ask reports 0 docs.
 */
export function loadTwinKnowledge(): Promise<AgentKnowledge> {
  cache ??= (async () => {
    const paths = knowledgeCandidates();
    const knowledge = await readFirst(paths);
    if (knowledge) return knowledge;
    log.warn(
      { cwd: process.cwd(), paths },
      "agent-knowledge.json not found; answering from the brief only",
    );
    return EMPTY;
  })();
  return cache;
}

/** Test-only: forget the cached load. */
export function resetTwinKnowledgeForTests(): void {
  cache = null;
}
