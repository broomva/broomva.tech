/**
 * Diagnostic endpoint for the agent-knowledge loader.
 *
 * GET /api/debug/knowledge — returns the runtime state of the knowledge
 * loader so that missing-file / misrouted-path issues in production can be
 * diagnosed without SSH access.
 *
 * Returns:
 *   • counts (documents, nodes, edges, terms) — non-zero iff load succeeded
 *   • the runtime context (cwd, __dirname when available, relevant env)
 *   • which candidate path resolved (if any), measured via statSync attempts
 *
 * No secrets, no PII, no content bodies. Safe to keep public.
 */

import fs from "node:fs";
import path from "node:path";
import type { NextRequest } from "next/server";
import {
  loadAgentKnowledge,
  resetKnowledgeCacheForTests,
} from "@/lib/ai/knowledge/site-content";

function candidatePaths(): string[] {
  return [
    path.join(process.cwd(), "public", "agent-knowledge.json"),
    path.join(process.cwd(), "apps", "chat", "public", "agent-knowledge.json"),
    path.join(__dirname, "..", "..", "..", "public", "agent-knowledge.json"),
    path.join(__dirname, "..", "..", "..", "..", "public", "agent-knowledge.json"),
    path.join(__dirname, "..", "..", "..", "..", "..", "public", "agent-knowledge.json"),
  ];
}

function probeFs(paths: string[]): Array<{ path: string; exists: boolean; size?: number }> {
  return paths.map((p) => {
    try {
      const st = fs.statSync(p);
      return { path: p, exists: st.isFile(), size: st.size };
    } catch {
      return { path: p, exists: false };
    }
  });
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  resetKnowledgeCacheForTests();
  const knowledge = await loadAgentKnowledge();

  const fsCandidates = probeFs(candidatePaths());

  const env = {
    VERCEL_URL: process.env.VERCEL_URL ?? null,
    VERCEL_ENV: process.env.VERCEL_ENV ?? null,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? null,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL ?? null,
    AGENT_KNOWLEDGE_URL: process.env.AGENT_KNOWLEDGE_URL ?? null,
  };

  const dirname = (() => {
    try {
      return __dirname;
    } catch {
      return null;
    }
  })();

  return Response.json({
    loader: {
      generatedAt: knowledge.generatedAt,
      commit: knowledge.commit,
      documents: knowledge.documents.length,
      graphNodes: knowledge.graph.nodes.length,
      graphEdges: knowledge.graph.links.length,
      invertedIndexTerms: Object.keys(knowledge.invertedIndex).length,
      loaded: knowledge.documents.length > 0,
    },
    runtime: {
      cwd: process.cwd(),
      dirname,
      nodeVersion: process.version,
    },
    env,
    fsCandidates,
  });
}
