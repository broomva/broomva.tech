import { createFromSource } from "fumadocs-core/search/server";
import { source } from "@/lib/source";

export const maxDuration = 10;

const { GET: searchGET } = createFromSource(source);

export async function GET(request: Request) {
  const response = await searchGET(request);
  if (!response.ok) return response;

  const headers = new Headers(response.headers);
  headers.set(
    "Cache-Control",
    "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
  );
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
