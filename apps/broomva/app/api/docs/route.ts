import { nanoid } from "nanoid";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createSpecDoc, listSpecDocs } from "@/lib/db/spec-doc-queries";
import { env } from "@/lib/env";
import { resolveAuth } from "@/lib/prompts/resolve-auth";

/**
 * /api/docs — publish + list agent-authored HTML documents (specs, PRDs,
 * architecture docs). Owner is the authenticated identity (CLI Bearer token's
 * `sub` OR browser Neon Auth session `user.id`, which resolve to the same
 * `user.id` via resolveAuth). Nothing is hardcoded; viewing is owner-gated.
 */

/** 2 MB cap — generous for self-contained Category-C HTML; guards against abuse. */
const MAX_HTML_BYTES = 2_000_000;

const publishSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  html: z.string().min(1).max(MAX_HTML_BYTES),
  source: z
    .object({
      repo: z.string().max(500).optional(),
      path: z.string().max(1000).optional(),
      commit: z.string().max(64).optional(),
    })
    .optional(),
});

/** Canonical public URL for a published doc. Prefers APP_URL, else request origin. */
function docUrl(request: NextRequest, id: string): string {
  const base = (env.APP_URL || new URL(request.url).origin).replace(/\/+$/, "");
  return `${base}/d/${id}`;
}

/** Best-effort title from <title> or first <h1> when the client omits one. */
function deriveTitle(html: string): string {
  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (title?.[1]?.trim()) return title[1].trim().slice(0, 300);
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1?.[1]) {
    const text = h1[1].replace(/<[^>]+>/g, "").trim();
    if (text) return text.slice(0, 300);
  }
  return "Untitled document";
}

/** POST /api/docs — publish a new HTML doc owned by the authenticated identity. */
export async function POST(request: NextRequest) {
  const auth = await resolveAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = publishSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const id = nanoid(12);
  const title = parsed.data.title?.trim() || deriveTitle(parsed.data.html);

  const doc = await createSpecDoc({
    id,
    ownerId: auth.userId,
    title,
    html: parsed.data.html,
    sourceRepo: parsed.data.source?.repo ?? null,
    sourcePath: parsed.data.source?.path ?? null,
    sourceCommit: parsed.data.source?.commit ?? null,
  });

  return NextResponse.json(
    {
      id: doc.id,
      title: doc.title,
      url: docUrl(request, doc.id),
      createdAt: doc.createdAt,
    },
    { status: 201 },
  );
}

/** GET /api/docs — list the authenticated owner's docs (metadata only). */
export async function GET(request: NextRequest) {
  const auth = await resolveAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const docs = await listSpecDocs(auth.userId);
  return NextResponse.json(
    docs.map((d) => ({ ...d, url: docUrl(request, d.id) })),
  );
}
