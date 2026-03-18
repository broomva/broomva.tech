import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSafeSession } from "@/lib/auth";
import {
  createUserPrompt,
  getVisiblePrompts,
} from "@/lib/db/queries";

export async function GET(request: NextRequest) {
  const { data: session } = await getSafeSession();
  const userId = session?.user?.id;

  const prompts = await getVisiblePrompts(userId ?? undefined);
  return NextResponse.json(prompts);
}

export async function POST(request: NextRequest) {
  const { data: session } = await getSafeSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const prompt = await createUserPrompt({
    userId: session.user.id,
    title: body.title,
    content: body.content,
    summary: body.summary ?? null,
    category: body.category ?? null,
    model: body.model ?? null,
    version: body.version ?? null,
    tags: body.tags ?? [],
    variables: body.variables ?? null,
    visibility: body.visibility ?? "private",
  });

  return NextResponse.json(prompt, { status: 201 });
}
