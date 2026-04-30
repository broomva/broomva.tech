#!/usr/bin/env bun
/**
 * Copies the bookkeeping snapshot from ~/.config/bookkeeping/status.json
 * into apps/chat/public/data/bookkeeping.json so it's served on the deployed site.
 *
 * Run manually or as part of a pre-commit / pre-deploy hook:
 *   bun apps/chat/scripts/sync-bookkeeping-snapshot.ts
 *
 * Idempotent. Exits 0 with a notice if the snapshot doesn't exist locally.
 */
import { copyFile, mkdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const SRC = join(homedir(), ".config", "bookkeeping", "status.json");
const PUBLIC_DIR = join(import.meta.dir, "..", "public", "data");
const DEST = join(PUBLIC_DIR, "bookkeeping.json");

async function main() {
  try {
    await stat(SRC);
  } catch {
    console.log(`[sync-bookkeeping] No snapshot at ${SRC} — skipping.`);
    return;
  }

  await mkdir(dirname(DEST), { recursive: true });
  await copyFile(SRC, DEST);

  const stats = await stat(DEST);
  console.log(
    `[sync-bookkeeping] Copied ${SRC} → ${DEST} (${stats.size} bytes)`,
  );
}

main().catch((err) => {
  console.error("[sync-bookkeeping] failed:", err);
  process.exit(1);
});
