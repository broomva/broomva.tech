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
  const title = body.title ?? "Untitled";
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const prompt = await createUserPrompt({
    userId: session.user.id,
    slug,
    title,
    content: body.content,
    summary: body.summary ?? null,
    category: body.category ?? null,
    model: body.model ?? null,
    version: body.version ?? null,
    tags: body.tags ?? [],
    variables: body.variables ?? null,
    links: body.links ?? null,
    visibility: body.visibility ?? "private",
    deletedAt: null,
  });

  return NextResponse.json(prompt, { status: 201 });
}
