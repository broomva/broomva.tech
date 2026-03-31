import { NextResponse } from "next/server";
import { getContentBySlug } from "@/lib/content";
import {
  getPromptBySlug,
  updateUserPrompt,
  softDeleteUserPrompt,
} from "@/lib/db/queries";
import { updatePromptSchema } from "@/lib/prompts/validation";
import { isAdmin } from "@/lib/prompts/admin";
import { commitPromptToGitHub } from "@/lib/prompts/github-commit";
import { resolveAuth } from "@/lib/prompts/resolve-auth";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  // DB first — gracefully handle missing migration
  let dbPrompt: Awaited<ReturnType<typeof getPromptBySlug>> | undefined;
  try {
    dbPrompt = await getPromptBySlug(slug);
  } catch {
    // DB schema not ready yet — fall through to MDX
  }
  if (dbPrompt) {
    return NextResponse.json({
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
    });
  }

  // MDX fallback
  const entry = await getContentBySlug("prompts", slug);
  if (!entry) {
    return NextResponse.json({ error: "Prompt not found" }, { status: 404 });
  }
  return NextResponse.json(entry);
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

  if (isAdmin(auth.email)) {
    await commitPromptToGitHub(updated);
  }

  return NextResponse.json(updated);
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
