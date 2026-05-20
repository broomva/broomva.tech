import { source } from "@/lib/source";
import { llms } from "fumadocs-core/source";

export const revalidate = 86400;

export function GET() {
  const content = llms(source).index();

  return new Response(content, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
    },
  });
}
