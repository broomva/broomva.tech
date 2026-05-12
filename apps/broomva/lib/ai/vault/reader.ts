import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, extname, join, relative } from "node:path";
import matter from "gray-matter";
import { createModuleLogger } from "@/lib/logger";

const log = createModuleLogger("vault:reader");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type VaultNote = {
  /** Absolute file path */
  path: string;
  /** Path relative to vault root */
  relativePath: string;
  /** Filename without extension */
  name: string;
  /** Parsed YAML frontmatter */
  frontmatter: Record<string, unknown>;
  /** Markdown body (without frontmatter) */
  body: string;
};

export type VaultSearchResult = {
  note: Pick<VaultNote, "name" | "relativePath" | "frontmatter">;
  /** Matching excerpt lines */
  excerpts: string[];
  /** Outgoing wikilinks found in the note */
  links: string[];
};

// ---------------------------------------------------------------------------
// Wikilink parsing
// ---------------------------------------------------------------------------

const WIKILINK_RE = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

/** Extract all wikilink targets from markdown content. */
export function extractWikilinks(content: string): string[] {
  const links: string[] = [];
  for (const match of content.matchAll(WIKILINK_RE)) {
    // match[1] is the target (before |), match[2] is the alias (after |)
    const target = match[1].trim();
    if (target) links.push(target);
  }
  return [...new Set(links)];
}

// ---------------------------------------------------------------------------
// Vault index — name → path mapping
// ---------------------------------------------------------------------------

type VaultIndex = Map<string, string>;

let cachedIndex: { vaultPath: string; index: VaultIndex; ts: number } | null =
  null;
const INDEX_TTL_MS = 60_000; // re-index after 60s

function shouldReindex(vaultPath: string): boolean {
  if (!cachedIndex) return true;
  if (cachedIndex.vaultPath !== vaultPath) return true;
  return Date.now() - cachedIndex.ts > INDEX_TTL_MS;
}

/** Recursively collect all .md files, following symlinks. */
function collectMarkdownFiles(dir: string, files: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return files;
  }

  for (const entry of entries) {
    // Skip hidden dirs and common noise
    if (entry.startsWith(".") || entry === "node_modules") continue;

    const full = join(dir, entry);
    let stat;
    try {
      // stat follows symlinks (unlike lstat)
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

/** Build an index mapping note names (lowercase, no ext) to absolute paths. */
export function indexVault(vaultPath: string): VaultIndex {
  if (!shouldReindex(vaultPath) && cachedIndex) return cachedIndex.index;

  const index: VaultIndex = new Map();
  const files = collectMarkdownFiles(vaultPath);

  for (const file of files) {
    const name = basename(file, ".md").toLowerCase();
    // First-seen wins (avoids collisions; top-level notes take priority
    // because readdirSync visits them before nested dirs)
    if (!index.has(name)) {
      index.set(name, file);
    }
    // Also index by relative path (for [[folder/name]] style links)
    const rel = relative(vaultPath, file)
      .replace(/\.md$/, "")
      .toLowerCase();
    if (!index.has(rel)) {
      index.set(rel, file);
    }
  }

  cachedIndex = { vaultPath, index, ts: Date.now() };
  log.info({ noteCount: index.size, vaultPath }, "Vault indexed");
  return index;
}

// ---------------------------------------------------------------------------
// Read a single note
// ---------------------------------------------------------------------------

/** Read and parse a vault note by absolute path. */
export function readNoteByPath(
  filePath: string,
  vaultPath: string
): VaultNote | null {
  try {
    const raw = readFileSync(filePath, "utf-8");
    const { data, content } = matter(raw);
    return {
      path: filePath,
      relativePath: relative(vaultPath, filePath),
      name: basename(filePath, ".md"),
      frontmatter: data,
      body: content,
    };
  } catch {
    return null;
  }
}

/** Resolve a wikilink target to a vault note. */
export function resolveWikilink(
  target: string,
  vaultPath: string
): VaultNote | null {
  const index = indexVault(vaultPath);

  // Strip any heading anchors: [[Note#heading]] → Note
  const clean = target.split("#")[0].trim().toLowerCase();

  const filePath = index.get(clean);
  if (!filePath) return null;

  return readNoteByPath(filePath, vaultPath);
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

/** Case-insensitive text search across all vault notes. */
export function searchVault(
  query: string,
  vaultPath: string,
  { maxResults = 10 }: { maxResults?: number } = {}
): VaultSearchResult[] {
  const index = indexVault(vaultPath);
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];

  const results: (VaultSearchResult & { score: number })[] = [];
  const seen = new Set<string>();

  for (const [, filePath] of index) {
    if (seen.has(filePath)) continue;
    seen.add(filePath);

    const note = readNoteByPath(filePath, vaultPath);
    if (!note) continue;

    const fullText = `${note.name} ${JSON.stringify(note.frontmatter)} ${note.body}`.toLowerCase();

    // Score: count how many terms match
    let score = 0;
    for (const term of terms) {
      if (fullText.includes(term)) score++;
    }
    if (score === 0) continue;

    // Boost exact name matches
    const nameLower = note.name.toLowerCase();
    for (const term of terms) {
      if (nameLower.includes(term)) score += 2;
    }

    // Boost frontmatter tag matches
    const tags = Array.isArray(note.frontmatter.tags)
      ? note.frontmatter.tags.map((t: string) => String(t).toLowerCase())
      : [];
    for (const term of terms) {
      if (tags.includes(term)) score += 1;
    }

    // Extract matching excerpt lines (up to 5)
    const lines = note.body.split("\n");
    const excerpts: string[] = [];
    for (const line of lines) {
      if (excerpts.length >= 5) break;
      const lower = line.toLowerCase();
      if (terms.some((t) => lower.includes(t)) && line.trim()) {
        excerpts.push(line.trim());
      }
    }

    const links = extractWikilinks(note.body);

    results.push({
      note: {
        name: note.name,
        relativePath: note.relativePath,
        frontmatter: note.frontmatter,
      },
      excerpts,
      links,
      score,
    });
  }

  // Sort by score descending, return top N
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, maxResults).map(({ score: _, ...rest }) => rest);
}

// ---------------------------------------------------------------------------
// Graph traversal
// ---------------------------------------------------------------------------

/** Traverse the wikilink graph starting from a note, up to `depth` hops. */
export function traverseGraph(
  startTarget: string,
  vaultPath: string,
  { depth = 1, maxNotes = 15 }: { depth?: number; maxNotes?: number } = {}
): VaultNote[] {
  const visited = new Set<string>();
  const result: VaultNote[] = [];
  const queue: { target: string; level: number }[] = [
    { target: startTarget, level: 0 },
  ];

  while (queue.length > 0 && result.length < maxNotes) {
    const item = queue.shift();
    if (!item) break;

    const { target, level } = item;
    const key = target.toLowerCase();
    if (visited.has(key)) continue;
    visited.add(key);

    const note = resolveWikilink(target, vaultPath);
    if (!note) continue;

    result.push(note);

    // Follow outgoing links if within depth
    if (level < depth) {
      const links = extractWikilinks(note.body);
      for (const link of links) {
        if (!visited.has(link.toLowerCase())) {
          queue.push({ target: link, level: level + 1 });
        }
      }
    }
  }

  return result;
}
