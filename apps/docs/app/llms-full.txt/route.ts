import { source } from "@/lib/source";

export const revalidate = 86400;

export async function GET() {
  const pages = source.getPages();

  const sections = pages
    .map((page) => {
      const markdown = (page.data as unknown as Record<string, unknown>)._markdown;
      if (typeof markdown !== "string") return null;
      return `# ${page.data.title}\nURL: ${page.url}\n\n${markdown}`;
    })
    .filter(Boolean)
    .join("\n\n---\n\n");

  return new Response(sections, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
    },
  });
}
