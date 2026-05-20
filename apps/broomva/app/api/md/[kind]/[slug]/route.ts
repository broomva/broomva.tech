import { type ContentKind, getContentBySlug } from "@/lib/content";
import { config } from "@/lib/config";

const VALID_KINDS = new Set<ContentKind>([
  "writing",
  "projects",
  "notes",
  "prompts",
]);

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ kind: string; slug: string }> },
) {
  const { kind, slug } = await params;

  if (!VALID_KINDS.has(kind as ContentKind)) {
    return new Response("Not found", { status: 404 });
  }

  const doc = await getContentBySlug(kind as ContentKind, slug);
  if (!doc) return new Response("Not found", { status: 404 });

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
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
