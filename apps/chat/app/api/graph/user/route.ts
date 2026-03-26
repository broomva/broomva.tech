/**
 * GET /api/graph/user — BRO-232
 *
 * Authenticated endpoint that returns the per-user knowledge graph overlay
 * sourced from Lago:
 *   - /v1/memory/manifest  → memory file nodes
 *   - /v1/memory/traverse  → BFS-connected knowledge clusters
 *   - /v1/sessions         → Arcan conversation nodes
 *
 * Returns a GraphData overlay (user-only nodes + links) to be merged with
 * the public graph on the client.
 */

import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { signLagoJWT } from "@/lib/ai/vault/jwt";
import { getSafeSession } from "@/lib/auth";
import type { GraphData, GraphLink, GraphNode } from "@/lib/graph/types";


interface ManifestEntry {
  path: string;
  blob_hash: string;
  size_bytes: number;
  content_type: string | null;
  updated_at: number;
}

interface LagoSession {
  session_id: string;
  name: string;
  created_at: number;
}

interface TraverseResult {
  nodes?: Array<{ id: string; title?: string; tags?: string[] }>;
  edges?: Array<{ from: string; to: string; kind?: string }>;
}

export async function GET() {
  const { data: sessionData } = await getSafeSession({
    fetchOptions: { headers: await headers() },
  });

  if (!sessionData?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const lagoUrl = process.env.LAGO_URL;
  if (!lagoUrl) {
    // Lago not configured — return empty overlay rather than erroring
    return NextResponse.json({
      nodes: [],
      links: [],
      generatedAt: new Date().toISOString(),
    } satisfies GraphData);
  }

  const token = await signLagoJWT({
    id: sessionData.user.id,
    email: sessionData.user.email ?? "",
  });

  const authHeader = { Authorization: `Bearer ${token}` };

  // Fetch all three sources concurrently; treat individual failures as empty
  const [manifestRes, sessionsRes] = await Promise.allSettled([
    fetch(`${lagoUrl}/v1/memory/manifest`, { headers: authHeader }),
    fetch(`${lagoUrl}/v1/sessions`, { headers: authHeader }),
  ]);

  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];

  // ── Memory file nodes ──────────────────────────────────────────────────
  if (manifestRes.status === "fulfilled" && manifestRes.value.ok) {
    const raw = await manifestRes.value.json().catch(() => ({}));
    const entries: ManifestEntry[] = Array.isArray(raw)
      ? raw
      : (raw.entries ?? []);

    for (const entry of entries) {
      const id = `memory:${entry.path}`;
      const label = entry.path.split("/").at(-1) ?? entry.path;
      nodes.push({
        id,
        label,
        type: "memory",
        summary: `${(entry.size_bytes / 1024).toFixed(1)} KB`,
        val: 2,
        public: false,
      });
    }
  }

  // ── Conversation nodes (Arcan sessions) ───────────────────────────────
  if (sessionsRes.status === "fulfilled" && sessionsRes.value.ok) {
    const raw = await sessionsRes.value.json().catch(() => []);
    const sessions: LagoSession[] = Array.isArray(raw) ? raw : [];

    for (const session of sessions) {
      const id = `conversation:${session.session_id}`;
      nodes.push({
        id,
        label: session.name || session.session_id.slice(0, 12),
        type: "conversation",
        summary: `Session ${session.session_id.slice(0, 12)}`,
        val: 3,
        public: false,
      });
    }
  }

  // ── BFS traversal overlay ─────────────────────────────────────────────
  // Only run if we have memory nodes to seed from
  if (nodes.filter((n) => n.type === "memory").length > 0) {
    const seeds = nodes
      .filter((n) => n.type === "memory")
      .slice(0, 5)
      .map((n) => n.label.replace(/\.md(x)?$/, ""));

    const traverseRes = await fetch(`${lagoUrl}/v1/memory/traverse`, {
      method: "POST",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({ seeds, depth: 2 }),
    }).catch(() => null);

    if (traverseRes?.ok) {
      const traversal: TraverseResult = await traverseRes
        .json()
        .catch(() => ({}));
      const existingIds = new Set(nodes.map((n) => n.id));

      for (const n of traversal.nodes ?? []) {
        const id = `memory:${n.id}`;
        if (!existingIds.has(id)) {
          nodes.push({
            id,
            label: n.title ?? n.id,
            type: "memory",
            tags: n.tags,
            val: 1,
            public: false,
          });
          existingIds.add(id);
        }
      }

      for (const e of traversal.edges ?? []) {
        links.push({
          source: `memory:${e.from}`,
          target: `memory:${e.to}`,
          type: e.kind === "wikilink" ? "wikilink" : "reference",
        });
      }
    }
  }

  return NextResponse.json(
    { nodes, links, generatedAt: new Date().toISOString() } satisfies GraphData,
    { headers: { "Cache-Control": "no-store" } },
  );
}
