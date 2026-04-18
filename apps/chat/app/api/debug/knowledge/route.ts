/**
 * Diagnostic endpoint for the agent-knowledge loader + tool helpers.
 *
 * GET /api/debug/knowledge              — loader state
 * GET /api/debug/knowledge?q=<term>     — test searchSiteContent()
 * GET /api/debug/knowledge?note=<slug>  — test readSiteNote()
 * GET /api/debug/knowledge?traverse=<node>  — test traverseFrom()
 *
 * No secrets, no PII, no content bodies (truncated if any).
 */

import fs from "node:fs";
import path from "node:path";
import type { NextRequest } from "next/server";
import {
  loadAgentKnowledge,
  readSiteNote,
  resetKnowledgeCacheForTests,
  searchSiteContent,
  traverseFrom,
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

function truncate(s: string | undefined, n = 160): string | undefined {
  if (!s) return s;
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

export async function GET(req: NextRequest) {
  resetKnowledgeCacheForTests();
  const knowledge = await loadAgentKnowledge();

  const url = new URL(req.url);
  const q = url.searchParams.get("q");
  const noteName = url.searchParams.get("note");
  const traverseSeed = url.searchParams.get("traverse");

  const probes: Record<string, unknown> = {};

  if (q) {
    const results = await searchSiteContent(q, { maxResults: 5 });
    probes.searchSiteContent = {
      query: q,
      resultCount: results.length,
      top: results.slice(0, 5).map((r) => ({
        id: r.id,
        slug: r.slug,
        url: r.url,
        score: r.score,
        titleSnippet: truncate(r.title),
      })),
    };
  }

  if (noteName) {
    const note = await readSiteNote(noteName);
    probes.readSiteNote = note
      ? {
          query: noteName,
          found: true,
          id: note.id,
          slug: note.slug,
          url: note.url,
          title: note.title,
          bodyPreview: truncate(note.body, 200),
        }
      : { query: noteName, found: false };
  }

  if (traverseSeed) {
    const { seed, neighbors } = await traverseFrom(traverseSeed, {
      edgeTypes: ["wikilink", "reference", "tag"],
      depth: 1,
      maxNeighbors: 10,
    });
    probes.traverseFrom = {
      query: traverseSeed,
      seed: seed ? { id: seed.id, type: seed.type, label: seed.label } : null,
      neighborCount: neighbors.length,
      neighbors: neighbors.slice(0, 5).map((n) => ({
        id: n.node.id,
        type: n.node.type,
        edgeType: n.edgeType,
        hops: n.hops,
      })),
    };
  }

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
    probes,
  });
}
