import { type NextRequest, NextResponse } from "next/server";

/**
 * GET /api/assets/[...path]
 *
 * Proxies asset requests to lagod's public blob endpoint.
 * Resolves asset paths via the site-assets manifest, then serves
 * the content-addressed blob with edge caching headers.
 *
 * Fallback: if LAGO_URL is not configured, returns 404.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: pathSegments } = await params;
  const assetPath = `/${pathSegments.join("/")}`;

  const lagoUrl = process.env.LAGO_URL;
  if (!lagoUrl) {
    return NextResponse.json(
      { error: "Asset service not configured" },
      { status: 503 }
    );
  }

  try {
    // Look up the asset hash from the site-assets manifest
    const hash = await resolveAssetHash(lagoUrl, assetPath);
    if (!hash) {
      return NextResponse.json(
        { error: `Asset not found: ${assetPath}` },
        { status: 404 }
      );
    }

    // Check if client has cached version (ETag)
    const ifNoneMatch = request.headers.get("if-none-match");
    if (ifNoneMatch) {
      const cleanEtag = ifNoneMatch.replace(/"/g, "");
      if (cleanEtag === hash) {
        return new NextResponse(null, {
          status: 304,
          headers: {
            ETag: `"${hash}"`,
            "Cache-Control": "public, max-age=31536000, immutable",
          },
        });
      }
    }

    // Fetch from lagod public blob endpoint
    const blobRes = await fetch(`${lagoUrl}/v1/public/blobs/${hash}`);
    if (!blobRes.ok) {
      return NextResponse.json(
        { error: "Failed to fetch asset from storage" },
        { status: 502 }
      );
    }

    const contentType =
      blobRes.headers.get("content-type") ?? "application/octet-stream";
    const body = await blobRes.arrayBuffer();

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        ETag: `"${hash}"`,
        "Cache-Control": "public, max-age=31536000, immutable",
        "CDN-Cache-Control": "public, max-age=31536000, immutable",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    console.error("[api/assets] proxy error:", error);
    return NextResponse.json(
      { error: "Internal error fetching asset" },
      { status: 500 }
    );
  }
}

// --- Manifest cache (in-memory, refreshed periodically)

type ManifestCache = {
  entries: Map<string, string>; // path → blob hash
  fetchedAt: number;
};

let manifestCache: ManifestCache | null = null;
const MANIFEST_TTL_MS = 60_000; // 1 minute

async function resolveAssetHash(
  lagoUrl: string,
  assetPath: string
): Promise<string | null> {
  const now = Date.now();

  // Refresh cache if stale or missing
  if (!manifestCache || now - manifestCache.fetchedAt > MANIFEST_TTL_MS) {
    try {
      const res = await fetch(
        `${lagoUrl}/v1/sessions/site-assets:public/manifest?branch=main`
      );
      if (res.ok) {
        const data = (await res.json()) as {
          entries: Array<{ path: string; blob_hash: string }>;
        };
        const entries = new Map<string, string>();
        for (const entry of data.entries) {
          entries.set(entry.path, entry.blob_hash);
        }
        manifestCache = { entries, fetchedAt: now };
      }
    } catch {
      // Keep stale cache on fetch failure
    }
  }

  if (!manifestCache) return null;

  // Try exact path match
  const hash = manifestCache.entries.get(assetPath);
  if (hash) return hash;

  // Try with leading slash normalization
  const normalized = assetPath.startsWith("/") ? assetPath : `/${assetPath}`;
  return manifestCache.entries.get(normalized) ?? null;
}
