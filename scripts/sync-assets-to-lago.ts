#!/usr/bin/env bun
/**
 * sync-assets-to-lago.ts — Upload site assets to Lago for self-delivery network.
 *
 * Uploads /public/images/writing/ and /public/audio/writing/ as files
 * to the site-assets:public Lago session. Once uploaded, the asset proxy
 * at /api/assets/[...path] can serve them via content-addressed blobs.
 *
 * Usage:
 *   bun scripts/sync-assets-to-lago.ts
 *
 * Environment:
 *   LAGO_URL      — Lago server URL (default: from .env.local)
 *   AUTH_SECRET    — JWT signing secret
 */

import { SignJWT } from "jose";
import { readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";

const LAGO_URL =
  process.env.LAGO_URL || "https://lagod-production-9423.up.railway.app";
const AUTH_SECRET = process.env.AUTH_SECRET;
const SESSION_NAME = "site-assets:public";
const PUBLIC_DIR = join(import.meta.dir, "../apps/chat/public");

const SYNC_DIRS = [
  "images/writing",
  "audio/writing",
  "images/projects",
  "audio/projects",
];

// MIME type detection
const MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};

function getMimeType(path: string): string {
  const ext = path.slice(path.lastIndexOf(".")).toLowerCase();
  return MIME_TYPES[ext] ?? "application/octet-stream";
}

async function signJWT(): Promise<string> {
  if (!AUTH_SECRET) {
    throw new Error("AUTH_SECRET is required for Lago authentication");
  }
  const secret = new TextEncoder().encode(AUTH_SECRET);
  return new SignJWT({ sub: "asset-sync", email: "system@broomva.tech" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .setIssuer("https://broomva.tech")
    .setAudience("broomva-life-services")
    .sign(secret);
}

async function collectFiles(baseDir: string, subDir: string): Promise<string[]> {
  const dir = join(baseDir, subDir);
  const files: string[] = [];

  try {
    const entries = await readdir(dir, { recursive: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const s = await stat(fullPath);
      if (s.isFile()) {
        files.push(relative(baseDir, fullPath));
      }
    }
  } catch {
    // Directory doesn't exist — skip
  }

  return files;
}

async function getSessionId(token: string): Promise<string> {
  // List sessions and find site-assets:public
  const res = await fetch(`${LAGO_URL}/v1/sessions`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error(`Failed to list sessions: ${res.status}`);
  }

  const sessions = (await res.json()) as Array<{
    session_id: string;
    name: string;
  }>;

  // Find the most recent site-assets:public session
  const session = sessions.find((s) => s.name === SESSION_NAME);
  if (session) return session.session_id;

  // Create one if it doesn't exist
  const createRes = await fetch(`${LAGO_URL}/v1/sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: SESSION_NAME }),
  });

  if (!createRes.ok) {
    throw new Error(`Failed to create session: ${createRes.status}`);
  }

  const created = (await createRes.json()) as { session_id: string };
  return created.session_id;
}

async function uploadFile(
  sessionId: string,
  token: string,
  filePath: string,
): Promise<{ ok: boolean; size: number }> {
  const fullPath = join(PUBLIC_DIR, filePath);
  const file = Bun.file(fullPath);
  const content = await file.arrayBuffer();
  const lagoPath = `/${filePath}`;

  const res = await fetch(
    `${LAGO_URL}/v1/sessions/${sessionId}/files${encodeURI(lagoPath)}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": getMimeType(filePath),
      },
      body: content,
    },
  );

  return { ok: res.ok, size: content.byteLength };
}

async function verifyManifest(
  sessionId: string,
  token: string,
): Promise<number> {
  const res = await fetch(
    `${LAGO_URL}/v1/sessions/${sessionId}/manifest?branch=main`,
    { headers: { Authorization: `Bearer ${token}` } },
  );

  if (!res.ok) return 0;

  const data = (await res.json()) as {
    entries: Array<{ path: string; blob_hash: string }>;
  };
  return data.entries.length;
}

// --- Main ---

async function main() {
  console.log("🔄 Syncing site assets to Lago...");
  console.log(`   Lago: ${LAGO_URL}`);
  console.log(`   Session: ${SESSION_NAME}\n`);

  // Sign JWT
  const token = await signJWT();
  console.log("✅ JWT signed\n");

  // Get or create session
  const sessionId = await getSessionId(token);
  console.log(`✅ Session: ${sessionId}\n`);

  // Collect all files
  const allFiles: string[] = [];
  for (const dir of SYNC_DIRS) {
    const files = await collectFiles(PUBLIC_DIR, dir);
    allFiles.push(...files);
    console.log(`📁 ${dir}: ${files.length} files`);
  }
  console.log(`\n📦 Total: ${allFiles.length} files to sync\n`);

  // Upload files
  let uploaded = 0;
  let failed = 0;
  let totalBytes = 0;

  for (const filePath of allFiles) {
    try {
      const result = await uploadFile(sessionId, token, filePath);
      if (result.ok) {
        uploaded++;
        totalBytes += result.size;
        if (uploaded % 10 === 0 || uploaded === allFiles.length) {
          console.log(
            `   ⬆️  ${uploaded}/${allFiles.length} (${(totalBytes / 1024 / 1024).toFixed(1)}MB)`,
          );
        }
      } else {
        failed++;
        console.log(`   ❌ ${filePath}`);
      }
    } catch (err) {
      failed++;
      console.log(`   ❌ ${filePath}: ${err}`);
    }
  }

  console.log(
    `\n✅ Uploaded: ${uploaded} files (${(totalBytes / 1024 / 1024).toFixed(1)}MB)`,
  );
  if (failed > 0) console.log(`❌ Failed: ${failed} files`);

  // Verify manifest
  const manifestCount = await verifyManifest(sessionId, token);
  console.log(`\n📋 Manifest: ${manifestCount} entries`);

  if (manifestCount > 0) {
    console.log("\n🎉 Self-delivery network ready!");
    console.log(
      "   Assets will be served via /api/assets/ proxy with immutable caching.",
    );
  } else {
    console.log(
      "\n⚠️  Manifest is empty. Check Lago session filesystem configuration.",
    );
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  // In CI, a Lago connectivity failure shouldn't block the pipeline
  // since public/ fallback exists. Exit 0 if it's a network error.
  if (
    err instanceof TypeError &&
    (err.message.includes("fetch") || err.message.includes("ECONNREFUSED"))
  ) {
    console.log(
      "\n⚠️  Lago unreachable — assets will be served from public/ fallback.",
    );
    process.exit(0);
  }
  process.exit(1);
});
