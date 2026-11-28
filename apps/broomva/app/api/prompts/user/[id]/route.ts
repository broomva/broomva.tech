import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSafeSession } from "@/lib/auth";
import {
  deleteUserPrompt,
  getUserPromptById,
  updateUserPrompt,
} from "@/lib/db/queries";

export const maxDuration = 15;

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
};

const VALID_VISIBILITIES = new Set(["public", "private"] as const);

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const prompt = await getUserPromptById(id);
  if (!prompt || prompt.deletedAt !== null) {
    return NextResponse.json(
      { error: "Not found" },
      { status: 404, headers: NO_STORE_HEADERS },
    );
  }

  // Require explicit "public" visibility for non-owners so arbitrary/private
  // values can never disclose a prompt body.
  if (prompt.visibility !== "public") {
    const { data: session } = await getSafeSession();
    if (session?.user?.id !== prompt.userId) {
      return NextResponse.json(
        { error: "Not found" },
        { status: 404, headers: NO_STORE_HEADERS },
      );
    }
  }

  return NextResponse.json(prompt, { headers: NO_STORE_HEADERS });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { data: session } = await getSafeSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();

  if (
    body.visibility !== undefined &&
    !VALID_VISIBILITIES.has(body.visibility)
  ) {
    return NextResponse.json(
      { error: "Invalid visibility; must be 'public' or 'private'" },
      { status: 400 },
    );
  }

  const updated = await updateUserPrompt(id, session.user.id, {
    title: body.title,
    content: body.content,
    summary: body.summary,
    category: body.category,
    model: body.model,
    version: body.version,
    tags: body.tags,
    variables: body.variables,
    visibility: body.visibility,
  });

  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { data: session } = await getSafeSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const deleted = await deleteUserPrompt(id, session.user.id);
  if (!deleted) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ deleted: true });
}
