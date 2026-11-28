import { NextResponse } from "next/server";
import { getContentBySlug } from "@/lib/content";
import {
  getPromptBySlug,
  getPromptBySlugAnyState,
  updateUserPrompt,
  softDeleteUserPrompt,
} from "@/lib/db/queries";
import { updatePromptSchema } from "@/lib/prompts/validation";
import { isAdmin } from "@/lib/prompts/admin";
import { mirrorIfAdmin, mirrorWarningHeaders } from "@/lib/prompts/mirror";
import { resolveAuth } from "@/lib/prompts/resolve-auth";

export const maxDuration = 15;

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const url = new URL(request.url);
  const includeMetrics = url.searchParams.get("include") === "metrics";

  // Check DB state first (including private and soft-deleted rows) so a
  // revoked or private prompt never leaks metrics or falls back to a stale
  // MDX mirror.
  let dbPrompt: Awaited<ReturnType<typeof getPromptBySlugAnyState>> | undefined;
  let dbLookupFailed = false;
  try {
    dbPrompt = await getPromptBySlugAnyState(slug);
  } catch {
    // DB schema not ready yet — fall through to MDX
    dbLookupFailed = true;
  }

  if (!dbLookupFailed && dbPrompt) {
    if (dbPrompt.deletedAt !== null || dbPrompt.visibility !== "public") {
      return NextResponse.json(
        { error: "Prompt not found" },
        { status: 404, headers: NO_STORE_HEADERS },
      );
    }

    let metrics:
      | Awaited<ReturnType<typeof import("@/lib/db/queries").getPromptMetrics>>
      | undefined;
    if (includeMetrics) {
      try {
        const { getPromptMetrics } = await import("@/lib/db/queries");
        metrics = await getPromptMetrics(slug);
      } catch {
        // Tables not ready — omit metrics gracefully
      }
    }

    return NextResponse.json(
      {
        title: dbPrompt.title,
        summary: dbPrompt.summary ?? "",
        content: dbPrompt.content,
        html: "",
        date: dbPrompt.updatedAt.toISOString(),
        slug: dbPrompt.slug,
        kind: "prompts",
        published: true,
        pinned: false,
        tags: dbPrompt.tags ?? [],
        links: dbPrompt.links ?? [],
        category: dbPrompt.category ?? undefined,
        model: dbPrompt.model ?? undefined,
        version: dbPrompt.version ?? undefined,
        variables: dbPrompt.variables ?? undefined,
        ...(includeMetrics ? { metrics: metrics ?? null } : {}),
      },
      { headers: NO_STORE_HEADERS },
    );
  }

  // MDX fallback (only when no DB row exists for this slug)
  const entry = await getContentBySlug("prompts", slug);
  if (!entry) {
    return NextResponse.json(
      { error: "Prompt not found" },
      { status: 404, headers: NO_STORE_HEADERS },
    );
  }

  let metrics:
    | Awaited<ReturnType<typeof import("@/lib/db/queries").getPromptMetrics>>
    | undefined;
  if (includeMetrics) {
    try {
      const { getPromptMetrics } = await import("@/lib/db/queries");
      metrics = await getPromptMetrics(slug);
    } catch {
      // Tables not ready — omit metrics gracefully
    }
  }

  return NextResponse.json(
    includeMetrics ? { ...entry, metrics: metrics ?? null } : entry,
    { headers: NO_STORE_HEADERS },
  );
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const auth = await resolveAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await params;
  const dbPrompt = await getPromptBySlug(slug);
  if (!dbPrompt) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (dbPrompt.userId !== auth.userId && !isAdmin(auth.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = updatePromptSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // Only admins can toggle isHighlighted
  const data = { ...parsed.data };
  if (data.isHighlighted !== undefined && !isAdmin(auth.email)) {
    delete data.isHighlighted;
  }

  const updated = await updateUserPrompt(
    dbPrompt.id,
    dbPrompt.userId,
    data,
  );
  if (!updated) {
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  // Admin: mirror updated DB row back to MDX in the repo. Surface mirror
  // failures (including throws) — see app/api/prompts/route.ts.
  const githubMirror = await mirrorIfAdmin(auth.email, updated);

  return NextResponse.json(
    { ...updated, ...(githubMirror ? { githubMirror } : {}) },
    { headers: mirrorWarningHeaders(githubMirror) },
  );
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const auth = await resolveAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await params;
  const dbPrompt = await getPromptBySlug(slug);
  if (!dbPrompt) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (dbPrompt.userId !== auth.userId && !isAdmin(auth.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await softDeleteUserPrompt(dbPrompt.id, dbPrompt.userId);
  return NextResponse.json({ deleted: true });
}
