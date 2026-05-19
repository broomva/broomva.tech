import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getContentList } from "@/lib/content";
import {
  getAllPublicPrompts,
  createUserPrompt,
  getPromptBySlug,
} from "@/lib/db/queries";
import { createPromptSchema } from "@/lib/prompts/validation";
import { isAdmin, generateSlug } from "@/lib/prompts/admin";
import { commitPromptToGitHub } from "@/lib/prompts/github-commit";
import { resolveAuth } from "@/lib/prompts/resolve-auth";
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
    copyCount: p.copyCount ?? 0,
    isHighlighted: p.isHighlighted ?? false,
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const category = searchParams.get("category");
  const tag = searchParams.get("tag");
  const model = searchParams.get("model");
  const format = searchParams.get("format");
  const includeMetrics = searchParams.get("include") === "metrics";
  const sort = searchParams.get("sort");

  let dbPrompts: UserPrompt[] = [];
  try {
    dbPrompts = await getAllPublicPrompts({ category, tag, model });
  } catch {
    // DB schema not ready yet (migration pending) — fall through to MDX
  }
  const dbSlugs = new Set(dbPrompts.map((p) => p.slug));
  const dbSummaries = dbPrompts.map(dbToSummary);

  let mdxEntries = await getContentList("prompts");
  mdxEntries = mdxEntries.filter((e) => !dbSlugs.has(e.slug));
  if (category) mdxEntries = mdxEntries.filter((e) => e.category === category);
  if (tag) mdxEntries = mdxEntries.filter((e) => e.tags.includes(tag));
  if (model) mdxEntries = mdxEntries.filter((e) => e.model === model);

  type Summary = ReturnType<typeof dbToSummary>;
  type EnrichedSummary = Summary & {
    metrics?: {
      copies: number;
      cli_pulls: number;
      skill_invokes: number;
      traces: number;
      runs_7d: number;
    };
  };
  let merged: EnrichedSummary[] = [...dbSummaries, ...mdxEntries];

  if (includeMetrics) {
    const { getMetricsForSlugs } = await import("@/lib/db/queries");
    const slugs = merged.map((e) => e.slug);
    let metricsMap: Awaited<ReturnType<typeof getMetricsForSlugs>> = new Map();
    try {
      metricsMap = await getMetricsForSlugs(slugs);
    } catch {
      // Tables not ready — proceed with empty metrics
    }
    merged = merged.map((e) => ({
      ...e,
      metrics: metricsMap.get(e.slug) ?? {
        copies: 0,
        cli_pulls: 0,
        skill_invokes: 0,
        traces: 0,
        runs_7d: 0,
      },
    }));
  }

  if (sort && includeMetrics) {
    const key = sort === "skill_invokes" ? "skill_invokes"
              : sort === "cli_pulls" ? "cli_pulls"
              : sort === "copies" ? "copies"
              : sort === "runs_7d" ? "runs_7d"
              : null;
    if (key) {
      merged.sort((a, b) => (b.metrics?.[key] ?? 0) - (a.metrics?.[key] ?? 0));
    } else {
      merged.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }
  } else {
    merged.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  if (format === "full") {
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
  const auth = await resolveAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { userId, email: userEmail } = auth;

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

  // Admin: commit to GitHub → triggers Vercel redeploy. Surface mirror
  // failures to the caller — otherwise the prompt lives in DB only and
  // never reaches the public /prompts page (MDX-backed via getContentList).
  const githubMirror = await mirrorIfAdmin(userEmail, prompt);

  return NextResponse.json(
    { ...prompt, ...(githubMirror ? { githubMirror } : {}) },
    {
      status: 201,
      headers: mirrorWarningHeaders(githubMirror),
    },
  );
}

type GithubMirrorStatus =
  | { ok: true }
  | { ok: false; error: string };

async function mirrorIfAdmin(
  email: string | undefined | null,
  prompt: Parameters<typeof commitPromptToGitHub>[0],
): Promise<GithubMirrorStatus | null> {
  if (!isAdmin(email)) return null;
  const ghResult = await commitPromptToGitHub(prompt);
  if (ghResult.success) return { ok: true };
  const error = ghResult.error ?? "unknown";
  console.error("GitHub commit failed:", error);
  return { ok: false, error };
}

function mirrorWarningHeaders(
  status: GithubMirrorStatus | null,
): Record<string, string> {
  if (!status || status.ok) return {};
  return {
    Warning: `199 - "GitHub mirror failed: ${status.error.replace(/"/g, "'")}"`,
  };
}
