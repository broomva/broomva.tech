/**
 * GET /api/graph/user — authenticated per-user graph overlay from Lago.
 *
 * Returns conversation nodes (Arcan sessions), artifact nodes (session files),
 * and memory nodes (from /v1/memory/manifest), scoped to the authenticated user.
 */

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getSafeSession } from "@/lib/auth";
import { createLagoClient, type LagoManifestEntry } from "@/lib/lago-client";
import { signLagoJWT } from "@/lib/ai/vault/jwt";

type UserNode = {
  id: string;
  label: string;
  type: string;
  val: number;
};

type UserLink = {
  source: string;
  target: string;
  type: string;
};

function filename(path: string): string {
  return path.split("/").filter(Boolean).at(-1) ?? path;
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
    return NextResponse.json({ error: "Lago not configured" }, { status: 503 });
  }

  const generatedAt = new Date().toISOString();
  const nodes: UserNode[] = [];
  const links: UserLink[] = [];

  let client: Awaited<ReturnType<typeof createLagoClient>>;
  try {
    client = await createLagoClient(
      sessionData.user.id,
      sessionData.user.email ?? "",
    );
  } catch {
    return NextResponse.json({ nodes, links, generatedAt }, { status: 503 });
  }

  // -- Sessions (conversation nodes) ----------------------------------------
  let sessions: Awaited<ReturnType<typeof client.listSessions>>;
  try {
    sessions = await client.listSessions();
  } catch {
    return NextResponse.json({ nodes, links, generatedAt });
  }

  for (const session of sessions) {
    const conversationId = `conversation:${session.session_id}`;
    nodes.push({
      id: conversationId,
      label:
        session.name?.trim() ||
        `Session ${session.session_id.slice(0, 8)}`,
      type: "conversation",
      val: 2,
    });

    // -- Artifacts (manifest entries per session) ----------------------------
    let entries: LagoManifestEntry[] = [];
    try {
      entries = await client.getManifest(session.session_id);
    } catch {
      // skip this session's artifacts — lago might not have them yet
      continue;
    }

    for (const entry of entries) {
      if (entry.path.startsWith(".")) continue;
      const artifactId = `artifact:${session.session_id}:${entry.path}`;
      nodes.push({
        id: artifactId,
        label: filename(entry.path),
        type: "artifact",
        val: 1,
      });
      links.push({ source: conversationId, target: artifactId, type: "reference" });
    }
  }

  // -- Memory nodes (graceful degradation) -----------------------------------
  try {
    const token = await signLagoJWT({
      id: sessionData.user.id,
      email: sessionData.user.email ?? "",
    });
    const res = await fetch(`${lagoUrl}/v1/memory/manifest`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const memEntries = (await res.json()) as Array<{ path: string }>;
      for (const entry of memEntries) {
        nodes.push({
          id: `memory:${entry.path}`,
          label: filename(entry.path),
          type: "memory",
          val: 1,
        });
      }
    }
  } catch {
    // memory endpoint unavailable — skip silently
  }

  return NextResponse.json({ nodes, links, generatedAt });
}
