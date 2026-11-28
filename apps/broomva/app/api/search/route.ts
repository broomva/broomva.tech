import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { getContentList, type ContentKind } from "@/lib/content";
import { getNonPublicPromptSlugs } from "@/lib/db/queries";

const CONTENT_KINDS: ContentKind[] = [
  "writing",
  "notes",
  "projects",
  "prompts",
];

const ONE_HOUR = 3600;
const MAX_QUERY_LEN = 200;
const CACHE_HEADERS = {
  "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=3600",
};
const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
};

export const maxDuration = 10;

const getCachedContent = unstable_cache(
  async () => {
    const allContent = await Promise.all(
      CONTENT_KINDS.map(async (kind) => {
        const items = await getContentList(kind);
        return items.map((item) => ({
          slug: item.slug,
          title: item.title,
          summary: item.summary,
          kind,
          tags: item.tags,
          date: item.date,
        }));
      }),
    );
    return allContent.flat();
  },
  ["site-search-content"],
  { revalidate: ONE_HOUR },
);

export async function GET(request: NextRequest) {
  const q =
    request.nextUrl.searchParams
      .get("q")
      ?.toLowerCase()
      .trim()
      .slice(0, MAX_QUERY_LEN) ?? "";

  const flat = await getCachedContent();

  let hiddenPromptSlugs: Set<string> | null = null;
  try {
    hiddenPromptSlugs = new Set(await getNonPublicPromptSlugs());
  } catch {
    // Fail closed for prompts when DB visibility cannot be verified.
    hiddenPromptSlugs = null;
  }

  const visible = flat.filter((item) => {
    if (item.kind !== "prompts") return true;
    if (hiddenPromptSlugs === null) return false;
    return !hiddenPromptSlugs.has(item.slug);
  });

  const results = (
    q
      ? visible.filter(
          (item) =>
            item.title.toLowerCase().includes(q) ||
            item.summary.toLowerCase().includes(q) ||
            item.tags.some((tag) => tag.toLowerCase().includes(q)) ||
            item.kind.includes(q),
        )
      : visible
  ).slice(0, 12);

  // Only CDN-cache responses that do not contain mutable prompts and did not
  // degrade on DB lookup.
  const hasPrompt = results.some((item) => item.kind === "prompts");
  const headers =
    hiddenPromptSlugs === null || hasPrompt ? NO_STORE_HEADERS : CACHE_HEADERS;

  return NextResponse.json({ results }, { headers });
}
