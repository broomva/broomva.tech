import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { type NextRequest, NextResponse } from "next/server";

/**
 * GET /api/assets/[...path]
 *
 * Proxies asset requests to lagod's public blob endpoint.
 * Resolves asset paths via the site-assets manifest, then serves
 * the content-addressed blob with edge caching headers.
 *
 * Fallback chain:
 *  1. Lago blob storage (if LAGO_URL configured and asset in manifest)
 *  2. Local public/ filesystem (always available)
 *  3. 404
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: pathSegments } = await params;
  const assetPath = `/${pathSegments.join("/")}`;

  const lagoUrl = process.env.LAGO_URL;

  // Try Lago first if configured
  if (lagoUrl) {
    try {
      const hash = await resolveAssetHash(lagoUrl, assetPath);
      if (hash) {
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

        const blobRes = await fetch(`${lagoUrl}/v1/public/blobs/${hash}`);
        if (blobRes.ok) {
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
        }
      }
    } catch (error) {
      console.warn("[api/assets] Lago unavailable, falling back to local:", error);
    }
  }

  // Fallback: serve from local public/ directory
  return serveLocalAsset(assetPath);
}

// --- Manifest cache (in-memory, refreshed periodically)

type ManifestCache = {
  entries: Map<string, string>; // path → blob hash
  fetchedAt: number;
};

let manifestCache: ManifestCache | null = null;
let resolvedSessionId: string | null = null;
const MANIFEST_TTL_MS = 60_000; // 1 minute
const SESSION_NAME = "site-assets:public";

async function resolveSessionId(lagoUrl: string): Promise<string | null> {
  if (resolvedSessionId) return resolvedSessionId;

  try {
    const res = await fetch(`${lagoUrl}/v1/sessions`);
    if (!res.ok) return null;

    const sessions = (await res.json()) as Array<{
      session_id: string;
      name: string;
    }>;

    // Find the first session matching our name
    const match = sessions.find((s) => s.name === SESSION_NAME);
    if (match) {
      resolvedSessionId = match.session_id;
      return resolvedSessionId;
    }
  } catch {
    // Graceful failure
  }
  return null;
}

async function resolveAssetHash(
  lagoUrl: string,
  assetPath: string
): Promise<string | null> {
  const now = Date.now();

  // Refresh cache if stale or missing
  if (!manifestCache || now - manifestCache.fetchedAt > MANIFEST_TTL_MS) {
    try {
      const sessionId = await resolveSessionId(lagoUrl);
      if (!sessionId) return null;

      const res = await fetch(
        `${lagoUrl}/v1/sessions/${sessionId}/manifest?branch=main`
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

// --- Local filesystem fallback

const MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".ico": "image/x-icon",
};

async function serveLocalAsset(assetPath: string): Promise<NextResponse> {
  // Prevent path traversal
  if (assetPath.includes("..")) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const localPath = join(process.cwd(), "public", assetPath);

  try {
    const data = await readFile(localPath);
    const ext = assetPath.substring(assetPath.lastIndexOf(".")).toLowerCase();
    const contentType = MIME_TYPES[ext] ?? "application/octet-stream";

    return new NextResponse(data, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch {
    return NextResponse.json(
      { error: `Asset not found: ${assetPath}` },
      { status: 404 }
    );
  }
}
