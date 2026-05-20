import { source } from "@/lib/source";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string[] }> },
) {
  const { slug } = await params;
  const page = source.getPage(slug);
  if (!page) return new Response("Not found", { status: 404 });

  const markdown = (page.data as unknown as Record<string, unknown>)._markdown;
  if (typeof markdown !== "string") {
    return new Response("Markdown not available", { status: 503 });
  }

  return new Response(markdown, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
