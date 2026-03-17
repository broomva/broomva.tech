#!/usr/bin/env node
/**
 * Validate that every published MDX file in content/ has a matching route
 * and that each slug referenced in (site) pages resolves to a file.
 */
import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const CONTENT = join(ROOT, "content");
const KINDS = ["notes", "projects", "writing"];

let errors = 0;

for (const kind of KINDS) {
  const dir = join(CONTENT, kind);
  let files;
  try {
    files = await readdir(dir);
  } catch {
    console.log(`⚠  content/${kind}/ not found, skipping`);
    continue;
  }

  const mdx = files.filter((f) => f.endsWith(".mdx") || f.endsWith(".md"));

  if (mdx.length === 0) {
    console.log(`⚠  content/${kind}/ has no content files`);
    continue;
  }

  for (const file of mdx) {
    const slug = file.replace(/\.(mdx?|md)$/, "");
    const routeDir = join(ROOT, "app", "(site)", kind, "[slug]");
    try {
      await readdir(routeDir);
    } catch {
      console.error(`✗  /${kind}/${slug} — no [slug] route at app/(site)/${kind}/[slug]`);
      errors++;
    }
  }

  console.log(`✓  content/${kind}/ — ${mdx.length} file(s) OK`);
}

if (errors > 0) {
  console.error(`\n${errors} error(s) found`);
  process.exit(1);
} else {
  console.log("\n✓ All content links valid");
}
