import { tool } from "ai";
import { z } from "zod";
import { createModuleLogger } from "@/lib/logger";
import {
  extractWikilinks,
  resolveWikilink,
  searchVault,
} from "../vault/reader";

const log = createModuleLogger("tools/knowledge-graph");

/**
 * Resolve the vault path from the environment.
 * Returns null if not configured — the tool gracefully degrades.
 */
function getVaultPath(): string | null {
  return process.env.VAULT_PATH || null;
}

/** Truncate note body to avoid blowing up the context window. */
function truncateBody(body: string, maxChars = 3000): string {
  if (body.length <= maxChars) return body;
  return `${body.slice(0, maxChars)}\n\n… (truncated, ${body.length} chars total)`;
}

export const searchKnowledge = tool({
  description: `Search the Broomva knowledge graph — an Obsidian vault containing architecture docs, project state, decisions, conventions, governance policies, and conversation history across all projects (Life/aiOS, Symphony, ChatOS, Control Kernel).

Use for:
- Finding project architecture, design decisions, or conventions
- Understanding cross-project relationships and dependencies
- Retrieving governance policies or control metalayer rules
- Looking up past decisions or session history
- Navigating the knowledge graph via wikilinks

Returns matching notes with frontmatter metadata, relevant excerpts, and outgoing wikilinks for further exploration.`,
  inputSchema: z.object({
    query: z
      .string()
      .describe(
        "Search query — keywords, project names, concepts, or note titles"
      ),
    followLinks: z
      .boolean()
      .default(false)
      .describe(
        "If true, follow wikilinks from top results to include connected notes (graph traversal, 1 hop)"
      ),
    maxResults: z
      .number()
      .int()
      .min(1)
      .max(20)
      .default(8)
      .describe("Maximum number of notes to return"),
  }),
  execute: async ({
    query,
    followLinks,
    maxResults,
  }: {
    query: string;
    followLinks: boolean;
    maxResults: number;
  }) => {
    const vaultPath = getVaultPath();
    if (!vaultPath) {
      return {
        error:
          "Knowledge graph not configured. Set VAULT_PATH environment variable to the Obsidian vault directory.",
      };
    }

    try {
      const results = searchVault(query, vaultPath, { maxResults });

      if (results.length === 0) {
        return {
          results: [],
          message: `No notes found matching "${query}".`,
        };
      }

      // Optionally follow wikilinks from top results
      let linkedNotes: {
        name: string;
        relativePath: string;
        frontmatter: Record<string, unknown>;
        excerpt: string;
      }[] = [];

      if (followLinks) {
        const seenPaths = new Set(results.map((r) => r.note.relativePath));
        const allLinkedTargets = results.flatMap((r) => r.links);
        const uniqueTargets = [...new Set(allLinkedTargets)].filter(
          (t) => !seenPaths.has(t)
        );

        for (const target of uniqueTargets.slice(0, 10)) {
          const note = resolveWikilink(target, vaultPath);
          if (note && !seenPaths.has(note.relativePath)) {
            seenPaths.add(note.relativePath);
            linkedNotes.push({
              name: note.name,
              relativePath: note.relativePath,
              frontmatter: note.frontmatter,
              excerpt: truncateBody(note.body, 500),
            });
          }
        }
      }

      return {
        results: results.map((r) => ({
          name: r.note.name,
          path: r.note.relativePath,
          frontmatter: r.note.frontmatter,
          excerpts: r.excerpts,
          outgoingLinks: r.links,
        })),
        ...(linkedNotes.length > 0 ? { linkedNotes } : {}),
      };
    } catch (error) {
      log.error({ err: error, query }, "Knowledge graph search error");
      return { error: "Failed to search knowledge graph" };
    }
  },
});

export const readKnowledgeNote = tool({
  description: `Read a specific note from the Broomva knowledge graph by name or path. Use after searchKnowledge to dive deeper into a specific note, or when you know the exact note name (e.g. "Consciousness", "Control Dashboard", "Broomva Index").

Returns the full note content with frontmatter and outgoing wikilinks.`,
  inputSchema: z.object({
    name: z
      .string()
      .describe(
        'Note name or relative path — e.g. "Consciousness", "00-Index/Projects", "02-Symphony/Symphony Index"'
      ),
    includeLinkedNotes: z
      .boolean()
      .default(false)
      .describe(
        "If true, also return summaries of notes linked via wikilinks (1 hop)"
      ),
  }),
  execute: async ({
    name,
    includeLinkedNotes,
  }: {
    name: string;
    includeLinkedNotes: boolean;
  }) => {
    const vaultPath = getVaultPath();
    if (!vaultPath) {
      return {
        error:
          "Knowledge graph not configured. Set VAULT_PATH environment variable.",
      };
    }

    try {
      const note = resolveWikilink(name, vaultPath);
      if (!note) {
        // Try a search as fallback
        const searchResults = searchVault(name, vaultPath, { maxResults: 3 });
        if (searchResults.length > 0) {
          return {
            error: `Note "${name}" not found. Did you mean one of these?`,
            suggestions: searchResults.map((r) => ({
              name: r.note.name,
              path: r.note.relativePath,
            })),
          };
        }
        return { error: `Note "${name}" not found in the knowledge graph.` };
      }

      const links = extractWikilinks(note.body);

      let linkedSummaries: {
        name: string;
        path: string;
        excerpt: string;
      }[] = [];

      if (includeLinkedNotes) {
        for (const target of links.slice(0, 10)) {
          const linked = resolveWikilink(target, vaultPath);
          if (linked) {
            linkedSummaries.push({
              name: linked.name,
              path: linked.relativePath,
              excerpt: truncateBody(linked.body, 300),
            });
          }
        }
      }

      return {
        name: note.name,
        path: note.relativePath,
        frontmatter: note.frontmatter,
        content: truncateBody(note.body, 6000),
        outgoingLinks: links,
        ...(linkedSummaries.length > 0 ? { linkedNotes: linkedSummaries } : {}),
      };
    } catch (error) {
      log.error({ err: error, name }, "Knowledge graph read error");
      return { error: "Failed to read note from knowledge graph" };
    }
  },
});
