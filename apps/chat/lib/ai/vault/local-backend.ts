/**
 * LocalVaultBackend — reads/writes .md files from the local filesystem.
 *
 * Wraps the existing `collectMarkdownFiles()` logic from reader.ts
 * behind the VaultBackend interface.
 */

import {
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
  mkdirSync,
  unlinkSync,
} from "node:fs";
import { extname, join, relative } from "node:path";
import type { VaultBackend } from "./backend";

/** Recursively collect all .md files, following symlinks. */
function collectMarkdownFiles(dir: string, files: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return files;
  }

  for (const entry of entries) {
    if (entry.startsWith(".") || entry === "node_modules") continue;

    const full = join(dir, entry);
    let stat;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      collectMarkdownFiles(full, files);
    } else if (stat.isFile() && extname(entry) === ".md") {
      files.push(full);
    }
  }

  return files;
}

export class LocalVaultBackend implements VaultBackend {
  readonly cacheKey: string;

  constructor(private readonly vaultPath: string) {
    this.cacheKey = `local:${vaultPath}`;
  }

  async listFiles(): Promise<string[]> {
    const files = collectMarkdownFiles(this.vaultPath);
    return files.map((f) => relative(this.vaultPath, f));
  }

  async readFile(relativePath: string): Promise<string | null> {
    try {
      const fullPath = join(this.vaultPath, relativePath);
      return readFileSync(fullPath, "utf-8");
    } catch {
      return null;
    }
  }

  async writeFile(relativePath: string, content: string): Promise<void> {
    const fullPath = join(this.vaultPath, relativePath);
    const dir = fullPath.substring(0, fullPath.lastIndexOf("/"));
    mkdirSync(dir, { recursive: true });
    writeFileSync(fullPath, content, "utf-8");
  }

  async deleteFile(relativePath: string): Promise<void> {
    try {
      const fullPath = join(this.vaultPath, relativePath);
      unlinkSync(fullPath);
    } catch {
      // Ignore if file doesn't exist
    }
  }
}
