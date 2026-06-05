import { nanoid } from "nanoid";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { listQueueHandoffs, pushHandoff } from "@/lib/db/handoff-queries";
import { env } from "@/lib/env";
import { resolveAuth } from "@/lib/prompts/resolve-auth";

/**
 * /api/handoffs — push + list handoff-queue entries (BRO-1415). A handoff is
 * the human-readable narrative the `/handoff` skill writes; pushing it makes it
 * visible at /maestro/queue, related to specs, and runnable via Copy/Continue.
 *
 * Owner is the authenticated identity (CLI Bearer token's `sub` OR browser
 * session `user.id`, resolved by resolveAuth). Owner-gated; nothing hardcoded.
 */

/** 1 MB cap on the markdown body — generous for a narrative handoff. */
const MAX_BODY_BYTES = 1_000_000;

const pushSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  body: z.string().min(1).max(MAX_BODY_BYTES),
  /** Stable arc identity; re-pushing the same slug appends a version. */
  slug: z.string().trim().min(1).max(128).optional(),
  /** One-sentence queue headline. */
  tldr: z.string().trim().max(600).optional(),
  /** The Copy-button payload (continue-prompt / first action). */
  firstAction: z.string().trim().max(4000).optional(),
  /** Related spec handles (the HTML specs at /d/<handle>). */
  specRefs: z.array(z.string().trim().min(1).max(128)).max(50).optional(),
  /** Queue ordering hint — higher floats up. */
  priority: z.number().int().min(-100).max(100).optional(),
  source: z
    .object({
      repo: z.string().max(500).optional(),
      path: z.string().max(1000).optional(),
      commit: z.string().max(64).optional(),
      branch: z.string().max(300).optional(),
      ticket: z.string().max(64).optional(),
      pr: z.number().int().optional(),
      session: z.string().max(128).optional(),
    })
    .optional(),
});

/** Canonical queue URL. The queue is a single board, not per-handoff routes. */
function queueUrl(request: NextRequest): string {
  const base = (env.APP_URL || new URL(request.url).origin).replace(/\/+$/, "");
  return `${base}/maestro/queue`;
}

/** Best-effort title from the first markdown `# ` heading. */
function deriveTitle(body: string): string {
  const h1 = body.match(/^#\s+(.+)$/m);
  if (h1?.[1]?.trim()) return h1[1].trim().slice(0, 300);
  const firstLine = body.split("\n").find((l) => l.trim().length > 0);
  return firstLine?.trim().slice(0, 300) || "Untitled handoff";
}

/** Best-effort TL;DR from a `**TL;DR.**` / `**TL;DR:**` lead line. */
function deriveTldr(body: string): string | undefined {
  const m = body.match(/\*\*TL;DR[.:]?\*\*\s*(.+)/i);
  const text = m?.[1]?.replace(/\s+/g, " ").trim();
  return text ? text.slice(0, 600) : undefined;
}

/** POST /api/handoffs — push a handoff onto the queue. Returns the queue URL. */
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
  const parsed = pushSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const id = nanoid(12);
  const title = parsed.data.title?.trim() || deriveTitle(parsed.data.body);
  const tldr = parsed.data.tldr?.trim() || deriveTldr(parsed.data.body) || null;

  const row = await pushHandoff({
    id,
    ownerId: auth.userId,
    title,
    body: parsed.data.body,
    slug: parsed.data.slug ?? null,
    tldr,
    firstAction: parsed.data.firstAction ?? null,
    specRefs: parsed.data.specRefs ?? [],
    priority: parsed.data.priority ?? 0,
    sourceRepo: parsed.data.source?.repo ?? null,
    sourcePath: parsed.data.source?.path ?? null,
    sourceCommit: parsed.data.source?.commit ?? null,
    branch: parsed.data.source?.branch ?? null,
    ticketId: parsed.data.source?.ticket ?? null,
    prNumber: parsed.data.source?.pr ?? null,
    sessionId: parsed.data.source?.session ?? null,
    actor: auth.agentId ? "agent" : "cli",
  });

  return NextResponse.json(
    {
      id: row.id,
      slug: row.slug,
      version: row.version,
      status: row.status,
      title: row.title,
      specRefs: row.specRefs,
      url: queueUrl(request),
      createdAt: row.createdAt,
    },
    { status: 201 },
  );
}

/** GET /api/handoffs — list the owner's active queue (metadata only). */
export async function GET(request: NextRequest) {
  const auth = await resolveAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const rows = await listQueueHandoffs(auth.userId);
  return NextResponse.json(rows);
}
