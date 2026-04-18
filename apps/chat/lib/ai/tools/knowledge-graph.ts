import { tool } from "ai";
import { z } from "zod";
import { createModuleLogger } from "@/lib/logger";
import { config } from "@/lib/config";
import {
  extractWikilinks,
  resolveWikilink,
  searchVault,
} from "../vault/reader";
import { LagoVaultBackend } from "../vault/lago-backend";
import { signLagoJWT } from "../vault/jwt";
import type { ToolSession } from "./types";
import {
  searchSiteContent as searchAgentSiteContent,
  readSiteNote,
  traverseFrom,
} from "@/lib/ai/knowledge/site-content";

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

/** Get a LagoVaultBackend for the authenticated user, if configured. */
async function getUserLagoBackend(
  session: ToolSession
): Promise<LagoVaultBackend | null> {
  if (!config.features.memoryVault) return null;

  const lagoUrl = process.env.LAGO_URL;
  if (!lagoUrl) return null;

  const userId = session.user?.id;
  const email = session.user?.email;
  if (!userId || !email) return null;

  try {
    const token = await signLagoJWT({ id: userId, email });
    return new LagoVaultBackend(lagoUrl, token);
  } catch {
    return null;
  }
}

/** Merge and rank results from multiple sources, deduplicating by path. */
function mergeAndRank(
  results: Array<{
    name: string;
    path: string;
    frontmatter: Record<string, unknown>;
    excerpts: string[];
    outgoingLinks: string[];
    score: number;
    source: string;
  }>,
  maxResults: number
): typeof results {
  const seen = new Set<string>();
  const deduped: typeof results = [];

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);

  for (const r of results) {
    const key = `${r.source}:${r.path}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(r);
    }
  }

  return deduped.slice(0, maxResults);
}

/**
 * Factory: searchKnowledge tool with dual-vault search.
 *
 * Searches both the server vault (VAULT_PATH) and the user's
 * Lago vault (if memoryVault feature is enabled).
 */
export function searchKnowledgeTool({ session }: { session: ToolSession }) {
  return tool({
    description: `Search the Broomva knowledge graph — an Obsidian vault containing architecture docs, project state, decisions, conventions, governance policies, and conversation history across all projects (Life/aiOS, Symphony, ChatOS, Control Kernel).

Also searches the user's personal memory vault (if configured) for user-specific notes and context.

Use for:
- Finding project architecture, design decisions, or conventions
- Understanding cross-project relationships and dependencies
- Retrieving governance policies or control metalayer rules
- Looking up past decisions or session history
- Searching user's personal memory and notes
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
      const allResults: Array<{
        name: string;
        path: string;
        frontmatter: Record<string, unknown>;
        excerpts: string[];
        outgoingLinks: string[];
        score: number;
        source: string;
      }> = [];

      // 1. Server vault (VAULT_PATH — local filesystem)
      const vaultPath = getVaultPath();
      if (vaultPath) {
        try {
          const results = searchVault(query, vaultPath, { maxResults });
          for (const r of results) {
            allResults.push({
              name: r.note.name,
              path: r.note.relativePath,
              frontmatter: r.note.frontmatter,
              excerpts: r.excerpts,
              outgoingLinks: r.links,
              score: r.excerpts.length + (r.links.length > 0 ? 1 : 0),
              source: "server",
            });
          }
        } catch (error) {
          log.error({ err: error, query }, "Server vault search error");
        }
      }

      // 2. User vault (lagod — remote, server-side search)
      const lagoBackend = await getUserLagoBackend(session);
      if (lagoBackend) {
        try {
          const lagoResults = await lagoBackend.search(query, {
            maxResults,
            followLinks,
          });
          for (const r of lagoResults) {
            allResults.push({
              name: r.name,
              path: r.path,
              frontmatter: r.frontmatter,
              excerpts: r.excerpts,
              outgoingLinks: r.links,
              score: r.score,
              source: "user",
            });
          }
        } catch (error) {
          log.error({ err: error, query }, "Lago vault search error");
        }
      }

      // 3. Site content (in-repo knowledge graph from public/agent-knowledge.json)
      try {
        const siteResults = await searchAgentSiteContent(query, { maxResults });
        for (const r of siteResults) {
          allResults.push({
            name: r.title,
            path: r.url,
            frontmatter: { kind: r.kind, tags: r.tags },
            excerpts: r.excerpts,
            outgoingLinks: r.wikilinks,
            score: r.score,
            source: "site",
          });
        }
      } catch (error) {
        log.error({ err: error, query }, "Site content search error");
      }

      if (allResults.length === 0) {
        if (!vaultPath && !lagoBackend) {
          return {
            error:
              "Knowledge graph not configured. Set VAULT_PATH or enable memoryVault with LAGO_URL.",
          };
        }
        return {
          results: [],
          message: `No notes found matching "${query}".`,
        };
      }

      // Merge, rank, deduplicate
      const merged = mergeAndRank(allResults, maxResults);

      // Optionally follow wikilinks (server vault only — Lago handles this server-side)
      let linkedNotes: {
        name: string;
        relativePath: string;
        frontmatter: Record<string, unknown>;
        excerpt: string;
      }[] = [];

      if (followLinks && vaultPath) {
        const seenPaths = new Set(merged.map((r) => r.path));
        const allLinkedTargets = merged
          .filter((r) => r.source === "server")
          .flatMap((r) => r.outgoingLinks);
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
        results: merged.map((r) => ({
          name: r.name,
          path: r.path,
          frontmatter: r.frontmatter,
          excerpts: r.excerpts,
          outgoingLinks: r.outgoingLinks,
          source: r.source,
        })),
        ...(linkedNotes.length > 0 ? { linkedNotes } : {}),
      };
    },
  });
}

/**
 * Factory: readKnowledgeNote tool with dual-vault resolution.
 */
export function readKnowledgeNoteTool({ session }: { session: ToolSession }) {
  return tool({
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
      // Try site-content (public knowledge graph, always available in production)
      try {
        const siteNote = await readSiteNote(name);
        if (siteNote) {
          return {
            name: siteNote.title,
            path: siteNote.url,
            frontmatter: siteNote.frontmatter,
            content: truncateBody(siteNote.body, 6000),
            outgoingLinks: siteNote.wikilinks,
            source: "site",
            ...(includeLinkedNotes && siteNote.wikilinks.length > 0
              ? {
                  linkedNotes: await Promise.all(
                    siteNote.wikilinks.slice(0, 10).map(async (wl) => {
                      const linked = await readSiteNote(wl);
                      return linked
                        ? {
                            name: linked.title,
                            path: linked.url,
                            excerpt: truncateBody(linked.body, 300),
                          }
                        : null;
                    }),
                  ).then((arr) => arr.filter((n): n is NonNullable<typeof n> => n !== null)),
                }
              : {}),
          };
        }
      } catch (error) {
        log.error({ err: error, name }, "Site-content read error");
      }

      // Try server vault first
      const vaultPath = getVaultPath();
      if (vaultPath) {
        try {
          const note = resolveWikilink(name, vaultPath);
          if (note) {
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
              source: "server",
              ...(linkedSummaries.length > 0
                ? { linkedNotes: linkedSummaries }
                : {}),
            };
          }
        } catch (error) {
          log.error({ err: error, name }, "Server vault read error");
        }
      }

      // Try user vault via Lago
      const lagoBackend = await getUserLagoBackend(session);
      if (lagoBackend) {
        try {
          const note = await lagoBackend.readNote(name);
          if (note) {
            return {
              name: note.name,
              path: note.path,
              frontmatter: note.frontmatter,
              content: truncateBody(note.body, 6000),
              outgoingLinks: note.links,
              source: "user",
            };
          }
        } catch (error) {
          log.error({ err: error, name }, "Lago vault read error");
        }
      }

      // Neither vault had the note — try search as fallback
      if (vaultPath) {
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
      }

      if (!vaultPath && !lagoBackend) {
        return {
          error:
            "Knowledge graph not configured. Set VAULT_PATH or enable memoryVault with LAGO_URL.",
        };
      }

      return { error: `Note "${name}" not found in the knowledge graph.` };
    },
  });
}

/**
 * Factory: traverseKnowledge tool.
 *
 * Walks the public agent knowledge graph (wikilinks, tags, `related:`) from a
 * seed node. Answers "what connects to X" and "what's in the neighborhood of Y"
 * questions without repeated searches.
 */
export function traverseKnowledgeTool(_: { session: ToolSession }) {
  return tool({
    description: `Traverse the public Broomva knowledge graph from a seed node. Follows wikilink, tag, and related-frontmatter edges.

Use when the user asks:
- "what's connected to X?"
- "how does X relate to Y?"
- "what else is in the X neighborhood?"
- "show me everything tagged X"

Prefer this over repeated searchKnowledge calls for graph-shape questions. The seed can be a document id (e.g. "writing/agent-native-architecture"), a slug, a title, or a tag name (e.g. "agent-os" resolves to "tag:agent-os").`,
    inputSchema: z.object({
      seed: z
        .string()
        .describe(
          'Seed node — document id ("writing/foo"), slug, title, or tag name.',
        ),
      edgeTypes: z
        .array(z.enum(["wikilink", "reference", "tag"]))
        .default(["wikilink", "reference", "tag"])
        .describe(
          "Which edge types to follow. Default follows all three.",
        ),
      depth: z
        .union([z.literal(1), z.literal(2)])
        .default(1)
        .describe("1 for immediate neighbors, 2 for neighbors-of-neighbors"),
      maxNeighbors: z
        .number()
        .int()
        .min(1)
        .max(30)
        .default(10)
        .describe("Maximum neighbors to return"),
    }),
    execute: async ({
      seed,
      edgeTypes,
      depth,
      maxNeighbors,
    }: {
      seed: string;
      edgeTypes: ("wikilink" | "reference" | "tag")[];
      depth: 1 | 2;
      maxNeighbors: number;
    }) => {
      const result = await traverseFrom(seed, { edgeTypes, depth, maxNeighbors });
      if (!result.seed) {
        return {
          error: `Seed "${seed}" not found in the public knowledge graph.`,
        };
      }
      return {
        seed: {
          id: result.seed.id,
          label: result.seed.label,
          type: result.seed.type,
          url: result.seed.url,
          tags: result.seed.tags,
        },
        neighbors: result.neighbors.map((n) => ({
          id: n.node.id,
          label: n.node.label,
          type: n.node.type,
          url: n.node.url,
          summary: n.node.summary,
          tags: n.node.tags,
          edgeType: n.edgeType,
          hops: n.hops,
        })),
      };
    },
  });
}

// Backward-compatible exports for cases where tools.ts imports directly
export const searchKnowledge = searchKnowledgeTool({
  session: { user: undefined },
});
export const readKnowledgeNote = readKnowledgeNoteTool({
  session: { user: undefined },
});
export const traverseKnowledge = traverseKnowledgeTool({
  session: { user: undefined },
});
