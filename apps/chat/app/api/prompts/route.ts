import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { headers } from "next/headers";
import { getContentList } from "@/lib/content";
import { getSafeSession } from "@/lib/auth";
import {
  getAllPublicPrompts,
  createUserPrompt,
  getPromptBySlug,
} from "@/lib/db/queries";
import { createPromptSchema } from "@/lib/prompts/validation";
import { isAdmin, generateSlug } from "@/lib/prompts/admin";
import { commitPromptToGitHub } from "@/lib/prompts/github-commit";
import type { UserPrompt } from "@/lib/db/schema";
import type { ContentSummary } from "@/lib/content";

function dbToSummary(p: UserPrompt): ContentSummary {
  return {
    title: p.title,
    summary: p.summary ?? "",
    date: p.updatedAt.toISOString(),
    slug: p.slug,
    kind: "prompts",
    published: true,
    pinned: false,
    tags: p.tags ?? [],
    links: p.links ?? [],
    category: p.category ?? undefined,
    model: p.model ?? undefined,
    version: p.version ?? undefined,
    variables: p.variables ?? undefined,
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const category = searchParams.get("category");
  const tag = searchParams.get("tag");
  const model = searchParams.get("model");
  const format = searchParams.get("format");

  // DB prompts (public)
  const dbPrompts = await getAllPublicPrompts({ category, tag, model });
  const dbSlugs = new Set(dbPrompts.map((p) => p.slug));
  const dbSummaries = dbPrompts.map(dbToSummary);

  // MDX fallback (only include entries not already in DB)
  let mdxEntries = await getContentList("prompts");
  mdxEntries = mdxEntries.filter((e) => !dbSlugs.has(e.slug));
  if (category) mdxEntries = mdxEntries.filter((e) => e.category === category);
  if (tag) mdxEntries = mdxEntries.filter((e) => e.tags.includes(tag));
  if (model) mdxEntries = mdxEntries.filter((e) => e.model === model);

  const merged = [...dbSummaries, ...mdxEntries].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );

  if (format === "full") {
    // For DB prompts, add content directly
    // For MDX, load via getContentBySlug
    const { getContentBySlug } = await import("@/lib/content");
    const full = await Promise.all(
      merged.map(async (entry) => {
        const dbMatch = dbPrompts.find((p) => p.slug === entry.slug);
        if (dbMatch) {
          return { ...entry, content: dbMatch.content, html: "" };
        }
        return getContentBySlug("prompts", entry.slug);
      }),
    );
    return NextResponse.json(full.filter(Boolean));
  }

  return NextResponse.json(merged);
}

export async function POST(request: NextRequest) {
  // Auth: check session or API key
  const apiKey = request.headers.get("authorization")?.replace("Bearer ", "");
  let userId = "";
  let userEmail = "";

  if (apiKey && apiKey === process.env.PROMPT_API_KEY) {
    // API key auth (for CLI usage) — treat as admin
    userId = process.env.PROMPT_ADMIN_USER_ID ?? "";
    userEmail = "carlosdavidescobar@gmail.com";
  } else {
    // Session auth
    const { data: session } = await getSafeSession({
      fetchOptions: { headers: await headers() },
    });
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    userId = session.user.id;
    userEmail = session.user.email;
  }

  const body = await request.json();
  const parsed = createPromptSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const slug = generateSlug(parsed.data.title);

  // Check slug uniqueness
  const existing = await getPromptBySlug(slug);
  if (existing) {
    return NextResponse.json(
      { error: `Prompt with slug "${slug}" already exists` },
      { status: 409 },
    );
  }

  const prompt = await createUserPrompt({
    userId,
    slug,
    title: parsed.data.title,
    content: parsed.data.content,
    summary: parsed.data.summary ?? null,
    category: parsed.data.category ?? null,
    model: parsed.data.model ?? null,
    version: parsed.data.version ?? null,
    tags: parsed.data.tags ?? [],
    variables: parsed.data.variables ?? null,
    links: parsed.data.links ?? null,
    visibility: parsed.data.visibility ?? "private",
    deletedAt: null,
  });

  // Admin: commit to GitHub → triggers Vercel redeploy
  if (isAdmin(userEmail)) {
    const ghResult = await commitPromptToGitHub(prompt);
    if (!ghResult.success) {
      console.error("GitHub commit failed:", ghResult.error);
    }
  }

  return NextResponse.json(prompt, { status: 201 });
}
