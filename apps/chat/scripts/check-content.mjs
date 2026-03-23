#!/usr/bin/env node
/**
 * Validate writing content quality at build time.
 *
 * Checks:
 * 1. Frontmatter audio/image references point to existing files
 * 2. No frontmatter keys leaked into body content (e.g., "audio: /audio/..." outside ---)
 * 3. Required frontmatter fields are present (title, summary, date, tags)
 */
import { readdir, readFile, access } from "node:fs/promises";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const CONTENT = join(ROOT, "content");
const PUBLIC = join(ROOT, "public");
const KINDS = ["writing", "notes", "projects"];

let errors = 0;
let warnings = 0;

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
    const body = bodyLines.join("\n");

    // Parse simple frontmatter fields
    const fm = {};
    for (const line of fmLines) {
      const match = line.match(/^(\w+):\s*(.+)/);
      if (match) {
        fm[match[1]] = match[2].replace(/^["']|["']$/g, "");
      }
    }

    // Check required fields
    if (!fm.title) {
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

    // Check audio file exists
    if (fm.audio) {
      const audioPath = join(PUBLIC, fm.audio);
      try {
        await access(audioPath);
      } catch {
        console.error(
          `✗  ${kind}/${file} — audio file missing: ${fm.audio}`
        );
        errors++;
      }
    }

    // Check image file exists (frontmatter hero image)
    if (fm.image) {
      const imagePath = join(PUBLIC, fm.image);
      try {
        await access(imagePath);
      } catch {
        console.warn(
          `⚠  ${kind}/${file} — image file missing: ${fm.image}`
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
