import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSafeSession } from "@/lib/auth";
import {
  deleteUserPrompt,
  getUserPromptById,
  updateUserPrompt,
} from "@/lib/db/queries";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const prompt = await getUserPromptById(id);
  if (!prompt) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Check visibility
  if (prompt.visibility === "private") {
    const { data: session } = await getSafeSession();
    if (session?.user?.id !== prompt.userId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  }

  return NextResponse.json(prompt);
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
