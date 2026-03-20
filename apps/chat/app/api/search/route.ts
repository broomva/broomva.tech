import { type NextRequest, NextResponse } from "next/server";
import { getContentList, type ContentKind } from "@/lib/content";

const CONTENT_KINDS: ContentKind[] = ["writing", "notes", "projects", "prompts"];

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.toLowerCase().trim() ?? "";

  const allContent = await Promise.all(
    CONTENT_KINDS.map(async (kind) => {
      const items = await getContentList(kind);
      return items.map((item) => ({
        id: `${kind}/${item.slug}`,
        title: item.title,
        summary: item.summary,
        kind,
        slug: item.slug,
        href: kind === "writing" || kind === "notes" || kind === "projects" || kind === "prompts"
          ? `/${kind}/${item.slug}`
          : `/${kind}`,
        tags: item.tags,
      }));
    }),
  );

  const flat = allContent.flat();

  if (!q) {
    return NextResponse.json({ results: flat.slice(0, 12) });
  }

  const filtered = flat.filter(
    (item) =>
      item.title.toLowerCase().includes(q) ||
      item.summary.toLowerCase().includes(q) ||
      item.tags.some((tag) => tag.toLowerCase().includes(q)) ||
      item.kind.includes(q),
  );

  return NextResponse.json({ results: filtered.slice(0, 12) });
}
