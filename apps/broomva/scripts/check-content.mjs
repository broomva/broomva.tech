#!/usr/bin/env node
/**
 * Validate writing content quality at build time.
 *
 * Checks:
 * 1. Required frontmatter fields (title, summary, date, tags)
 * 2. Writing posts MUST have audio (frontmatter ref + reachable file)
 * 3. Frontmatter audio/image references point to existing files
 *    — locally under public/, OR in the Lago site-assets:public manifest
 *      for paths under /images/writing|projects, /audio/writing|projects,
 *      and /video/ (which are no longer committed to git).
 * 4. No frontmatter keys leaked into body content
 */
import { readdir, readFile, access } from "node:fs/promises";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const CONTENT = join(ROOT, "content");
const PUBLIC = join(ROOT, "public");
const KINDS = ["writing", "notes", "projects"];

// Writing posts require these fields. Other kinds are more relaxed.
const REQUIRED_WRITING_FIELDS = ["title", "summary", "date"];

// Asset path prefixes whose files now live in Lago, not in public/.
// See apps/broomva/next.config.ts rewrites + scripts/sync-assets-to-lago.ts.
const LAGO_PREFIXES = [
  "/images/writing/",
  "/images/projects/",
  "/audio/writing/",
  "/audio/projects/",
  "/video/",
];

const LAGO_URL = process.env.LAGO_URL || "https://api.lago.arcan.la";
const LAGO_SESSION_NAME = "site-assets:public";

let errors = 0;
let warnings = 0;

/** Set of paths present in Lago's site-assets:public manifest, or null if
 *  the fetch failed (treated as "unknown — assume present" for Lago-managed
 *  prefixes so CI doesn't go red purely because Lago is unreachable). */
async function loadLagoManifest() {
  try {
    const sRes = await fetch(`${LAGO_URL}/v1/sessions`);
    if (!sRes.ok) return null;
    const sessions = await sRes.json();
    const session = sessions.find((s) => s.name === LAGO_SESSION_NAME);
    if (!session) return null;
    const mRes = await fetch(
      `${LAGO_URL}/v1/sessions/${session.session_id}/manifest?branch=main`
    );
    if (!mRes.ok) return null;
    const data = await mRes.json();
    const paths = new Set();
    for (const entry of data.entries) {
      if (entry.content_type !== "inode/directory") paths.add(entry.path);
    }
    return paths;
  } catch {
    return null;
  }
}

const lagoManifest = await loadLagoManifest();
if (lagoManifest) {
  console.log(`ℹ  Lago manifest: ${lagoManifest.size} entries from ${LAGO_URL}`);
} else {
  console.log(
    `ℹ  Lago manifest unreachable (${LAGO_URL}) — Lago-managed assets will be assumed present.`
  );
}

/**
 * Returns one of:
 *   { kind: "ok" }                      — exists locally or in Lago
 *   { kind: "missing-lago" }            — Lago-managed but not in manifest
 *   { kind: "missing-local" }           — non-Lago and not on disk
 *   { kind: "lago-unknown" }            — Lago-managed prefix, manifest down
 */
async function resolveAsset(assetPath) {
  const onDisk = join(PUBLIC, assetPath);
  try {
    await access(onDisk);
    return { kind: "ok" };
  } catch {}

  const isLagoManaged = LAGO_PREFIXES.some((p) => assetPath.startsWith(p));
  if (!isLagoManaged) return { kind: "missing-local" };

  if (!lagoManifest) return { kind: "lago-unknown" };
  return lagoManifest.has(assetPath)
    ? { kind: "ok" }
    : { kind: "missing-lago" };
}

for (const kind of KINDS) {
  const dir = join(CONTENT, kind);
  let files;
  try {
    files = await readdir(dir);
  } catch {
    continue;
  }

  const mdx = files.filter((f) => f.endsWith(".mdx") || f.endsWith(".md"));

  for (const file of mdx) {
    const filePath = join(dir, file);
    const slug = file.replace(/\.(mdx?|md)$/, "");
    const raw = await readFile(filePath, "utf8");

    // Parse frontmatter boundaries
    const lines = raw.split("\n");
    let fmStart = -1;
    let fmEnd = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim() === "---") {
        if (fmStart === -1) {
          fmStart = i;
        } else {
          fmEnd = i;
          break;
        }
      }
    }

    if (fmStart === -1 || fmEnd === -1) {
      console.error(`✗  ${kind}/${file} — missing frontmatter delimiters`);
      errors++;
      continue;
    }

    // Extract frontmatter and body
    const fmLines = lines.slice(fmStart + 1, fmEnd);
    const bodyLines = lines.slice(fmEnd + 1);

    // Parse simple frontmatter fields
    const fm = {};
    for (const line of fmLines) {
      const match = line.match(/^(\w+):\s*(.+)/);
      if (match) {
        fm[match[1]] = match[2].replace(/^["']|["']$/g, "");
      }
    }

    // Skip unpublished drafts
    if (fm.published === "false") continue;

    // Check required fields for writing posts
    if (kind === "writing") {
      for (const field of REQUIRED_WRITING_FIELDS) {
        if (!fm[field]) {
          console.error(
            `✗  ${kind}/${file} — missing required field: ${field}`
          );
          errors++;
        }
      }
    } else if (!fm.title) {
      console.error(`✗  ${kind}/${file} — missing required field: title`);
      errors++;
    }

    // Check for leaked frontmatter keys in body (outside code blocks)
    let inCodeBlock = false;
    for (let i = 0; i < bodyLines.length; i++) {
      const line = bodyLines[i];
      if (line.startsWith("```")) {
        inCodeBlock = !inCodeBlock;
        continue;
      }
      if (!inCodeBlock && /^audio:\s*\/audio\//.test(line)) {
        const lineNum = fmEnd + 2 + i;
        console.error(
          `✗  ${kind}/${file}:${lineNum} — frontmatter "audio:" leaked into body content`
        );
        errors++;
      }
      if (!inCodeBlock && /^image:\s*\/images\//.test(line)) {
        const lineNum = fmEnd + 2 + i;
        console.error(
          `✗  ${kind}/${file}:${lineNum} — frontmatter "image:" leaked into body content`
        );
        errors++;
      }
    }

    // ── Writing posts MUST have audio ─────────────────────────────
    if (kind === "writing") {
      if (!fm.audio) {
        console.error(
          `✗  ${kind}/${file} — missing audio field in frontmatter (every writing post must have audio narration)`
        );
        errors++;
      } else {
        const res = await resolveAsset(fm.audio);
        if (res.kind === "missing-local" || res.kind === "missing-lago") {
          const where = res.kind === "missing-lago" ? "in Lago manifest" : "on disk";
          console.error(
            `✗  ${kind}/${file} — audio file missing ${where}: ${fm.audio}`
          );
          errors++;
        } else if (res.kind === "lago-unknown") {
          console.warn(
            `⚠  ${kind}/${file} — audio not on disk and Lago manifest unreachable; assumed present: ${fm.audio}`
          );
          warnings++;
        }
      }
    } else if (fm.audio) {
      // Non-writing: audio is optional but if referenced, file must resolve
      const res = await resolveAsset(fm.audio);
      if (res.kind === "missing-local" || res.kind === "missing-lago") {
        const where = res.kind === "missing-lago" ? "in Lago manifest" : "on disk";
        console.error(
          `✗  ${kind}/${file} — audio file missing ${where}: ${fm.audio}`
        );
        errors++;
      } else if (res.kind === "lago-unknown") {
        console.warn(
          `⚠  ${kind}/${file} — audio not on disk and Lago manifest unreachable; assumed present: ${fm.audio}`
        );
        warnings++;
      }
    }

    // Check image file exists (frontmatter hero image) — Lago-aware.
    if (fm.image) {
      const res = await resolveAsset(fm.image);
      if (res.kind === "missing-local" || res.kind === "missing-lago") {
        const where = res.kind === "missing-lago" ? "in Lago manifest" : "on disk";
        console.warn(
          `⚠  ${kind}/${file} — image file missing ${where}: ${fm.image}`
        );
        warnings++;
      } else if (res.kind === "lago-unknown") {
        console.warn(
          `⚠  ${kind}/${file} — image not on disk and Lago manifest unreachable; assumed present: ${fm.image}`
        );
        warnings++;
      }
    }
  }
}

if (errors > 0) {
  console.error(`\n${errors} error(s), ${warnings} warning(s)`);
  process.exit(1);
} else {
  console.log(`✓ Content validation passed (${warnings} warning(s))`);
}
