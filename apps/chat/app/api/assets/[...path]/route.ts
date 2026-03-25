import { type NextRequest, NextResponse } from "next/server";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".ogg": "audio/ogg",
};

/**
 * Parse a Range header and return the start/end byte offsets.
 */
function parseRange(
  rangeHeader: string,
  totalSize: number
): { start: number; end: number } | null {
  const match = rangeHeader.match(/^bytes=(\d+)-(\d*)$/);
  if (!match) return null;
  const start = Number.parseInt(match[1], 10);
  const end = match[2] ? Number.parseInt(match[2], 10) : totalSize - 1;
  if (start >= totalSize || end >= totalSize || start > end) return null;
  return { start, end };
}

/**
 * Serve a buffer with Range request support.
 */
function serveWithRange(
  request: NextRequest,
  body: Buffer | Uint8Array,
  contentType: string,
  cacheControl: string,
  extraHeaders?: Record<string, string>
): NextResponse {
  const totalSize = body.length;
  const rangeHeader = request.headers.get("range");

  const baseHeaders: Record<string, string> = {
    "Content-Type": contentType,
    "Accept-Ranges": "bytes",
    "Cache-Control": cacheControl,
    ...extraHeaders,
  };

  if (rangeHeader) {
    const range = parseRange(rangeHeader, totalSize);
    if (!range) {
      return new NextResponse(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${totalSize}` },
      });
    }
    const { start, end } = range;
    const chunk = body.slice(start, end + 1);
    return new NextResponse(chunk, {
      status: 206,
      headers: {
        ...baseHeaders,
        "Content-Length": String(chunk.length),
        "Content-Range": `bytes ${start}-${end}/${totalSize}`,
      },
    });
  }

  return new NextResponse(body, {
    status: 200,
    headers: {
      ...baseHeaders,
      "Content-Length": String(totalSize),
    },
  });
}

/**
 * Serve an asset from the public/ directory as a fallback.
 */
async function serveFromPublic(
  request: NextRequest,
  assetPath: string
): Promise<NextResponse | null> {
  const publicPath = join(process.cwd(), "public", assetPath);
  if (!existsSync(publicPath)) return null;

  const body = await readFile(publicPath);
  const ext = assetPath.slice(assetPath.lastIndexOf(".")).toLowerCase();
  const contentType = MIME_TYPES[ext] ?? "application/octet-stream";

  return serveWithRange(request, body, contentType, "public, max-age=3600");
}

/**
 * GET /api/assets/[...path]
 *
 * Proxies asset requests to lagod's public blob endpoint.
 * Resolves asset paths via the site-assets manifest, then serves
 * the content-addressed blob with edge caching headers.
 *
 * Fallback: serves from public/ directory if Lago is unavailable or
 * the asset isn't in the Lago manifest.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: pathSegments } = await params;
  const assetPath = `/${pathSegments.join("/")}`;

  const lagoUrl = process.env.LAGO_URL;
  if (!lagoUrl) {
    // Lago not configured — try public/ fallback
    const publicRes = await serveFromPublic(request, assetPath);
    if (publicRes) return publicRes;
    return NextResponse.json(
      { error: "Asset service not configured" },
      { status: 503 }
    );
  }

  try {
    // Look up the asset hash from the site-assets manifest
    const hash = await resolveAssetHash(lagoUrl, assetPath);
    if (!hash) {
      // Asset not in Lago — try public/ fallback
      const publicRes = await serveFromPublic(request, assetPath);
      if (publicRes) return publicRes;
      return NextResponse.json(
        { error: `Asset not found: ${assetPath}` },
        { status: 404 }
      );
    }

    // Redirect directly to lagod's public blob endpoint.
    // This eliminates the double-buffer: the browser fetches the blob
    // straight from lagod with proper Range support, Content-Length,
    // and Accept-Ranges headers — critical for mobile video playback.
    const blobUrl = `${lagoUrl}/v1/public/blobs/${hash}`;
    return NextResponse.redirect(blobUrl, 302);
  } catch (error) {
    console.error("[api/assets] proxy error:", error);
    return NextResponse.json(
      { error: "Internal error fetching asset" },
      { status: 500 }
    );
  }
}

// --- Session ID + Manifest cache (in-memory, refreshed periodically)

type ManifestCache = {
  entries: Map<string, string>; // path → blob hash
  fetchedAt: number;
};

let manifestCache: ManifestCache | null = null;
let sessionIdCache: { id: string; fetchedAt: number } | null = null;
const MANIFEST_TTL_MS = 60_000; // 1 minute
const SESSION_TTL_MS = 300_000; // 5 minutes

/**
 * Resolve the site-assets:public session name to a session ID.
 * Lago requires session IDs in API paths, not names.
 */
async function resolveSessionId(lagoUrl: string): Promise<string | null> {
  const now = Date.now();

  if (sessionIdCache && now - sessionIdCache.fetchedAt < SESSION_TTL_MS) {
    return sessionIdCache.id;
  }

  try {
    const res = await fetch(`${lagoUrl}/v1/sessions`);
    if (!res.ok) return sessionIdCache?.id ?? null;

    const sessions = (await res.json()) as Array<{
      session_id: string;
      name: string;
    }>;

    const target = sessions.find((s) => s.name === "site-assets:public");
    if (target) {
      sessionIdCache = { id: target.session_id, fetchedAt: now };
      return target.session_id;
    }
  } catch {
    // Keep stale cache on failure
  }

  return sessionIdCache?.id ?? null;
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
