import { type NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { getContentList, type ContentKind } from "@/lib/content";

const CONTENT_KINDS: ContentKind[] = [
  "writing",
  "notes",
  "projects",
  "prompts",
];

const ONE_HOUR = 3600;

const getCachedContent = unstable_cache(
  async () => {
    const allContent = await Promise.all(
      CONTENT_KINDS.map(async (kind) => {
        const items = await getContentList(kind);
        return items.map((item) => ({
          id: `${kind}/${item.slug}`,
          title: item.title,
          summary: item.summary,
          kind,
          slug: item.slug,
          href: `/${kind}/${item.slug}`,
          tags: item.tags,
        }));
      }),
    );
    return allContent.flat();
  },
  ["site-search-content"],
  { revalidate: ONE_HOUR },
);

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.toLowerCase().trim() ?? "";

  const flat = await getCachedContent();

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
