import { type ContentKind, getContentBySlug } from "@/lib/content";
import { config } from "@/lib/config";
import { getPromptBySlugAnyState } from "@/lib/db/queries";

export const maxDuration = 10;

const VALID_KINDS = new Set<ContentKind>([
  "writing",
  "projects",
  "notes",
  "prompts",
]);

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ kind: string; slug: string }> },
) {
  const { kind, slug } = await params;

  if (!VALID_KINDS.has(kind as ContentKind)) {
    return new Response("Not found", { status: 404 });
  }

  if (kind === "prompts") {
    let dbPrompt:
      | Awaited<ReturnType<typeof getPromptBySlugAnyState>>
      | undefined;
    try {
      dbPrompt = await getPromptBySlugAnyState(slug);
    } catch {
      return new Response("Service unavailable", {
        status: 503,
        headers: NO_STORE_HEADERS,
      });
    }
    if (
      dbPrompt &&
      (dbPrompt.deletedAt !== null || dbPrompt.visibility !== "public")
    ) {
      return new Response("Not found", {
        status: 404,
        headers: NO_STORE_HEADERS,
      });
    }
  }

  const doc = await getContentBySlug(kind as ContentKind, slug);
  if (!doc) {
    return new Response("Not found", {
      status: 404,
      headers: kind === "prompts" ? NO_STORE_HEADERS : undefined,
    });
  }

  const url = `${config.appUrl}/${kind}/${slug}`;
  const tagsLine = doc.tags.length > 0 ? `\ntags: [${doc.tags.join(", ")}]` : "";
  const markdown = `---
title: "${doc.title}"
date: ${doc.date}${tagsLine}
url: ${url}
---

# ${doc.title}

> ${doc.summary}

${doc.content}`;

  return new Response(markdown, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control":
        kind === "prompts"
          ? "private, no-store"
          : "public, max-age=3600, s-maxage=3600",
    },
  });
}
