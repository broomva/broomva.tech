/**
 * Context Assembler — Unified query across all four consciousness stack layers.
 *
 * Layers:
 *   1. Working memory  (context window — handled by AI SDK, skipped here)
 *   2. Auto-memory     (user vault via LagoVaultBackend)
 *   3. Episodic memory (conversation logs via Lago site-content session)
 *   4. Knowledge graph (server vault via VAULT_PATH + site content)
 *
 * Each layer is queried independently and results are merged, deduplicated,
 * and ranked into a unified response with source attribution.
 *
 * Graceful degradation: if a layer is unavailable (missing env, network
 * error, unauthenticated), it returns an empty result set and the assembler
 * continues with the remaining layers.
 */

import { createModuleLogger } from "@/lib/logger";
import { config } from "@/lib/config";
import { searchVault } from "./vault/reader";
import { LagoVaultBackend } from "./vault/lago-backend";
import { signLagoJWT } from "./vault/jwt";
import type { ToolSession } from "./tools/types";

const log = createModuleLogger("context-assembler");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ContextSource =
  | "working_memory"
  | "user_vault"
  | "site_content"
  | "knowledge_graph";

export interface ContextResult {
  name: string;
  path: string;
  excerpt: string;
  score: number;
}

export interface ContextLayer {
  source: ContextSource;
  results: ContextResult[];
}

export interface AssembleContextOptions {
  /** Tool session with optional user for authenticated layers. */
  session?: ToolSession;
  /** Maximum results per layer (default: 5). */
  maxResultsPerLayer?: number;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Resolve VAULT_PATH from the environment, or null if not configured. */
function getVaultPath(): string | null {
  return process.env.VAULT_PATH || null;
}

/** Get a LagoVaultBackend for the authenticated user, if configured. */
async function getUserLagoBackend(
  session?: ToolSession,
): Promise<LagoVaultBackend | null> {
  if (!config.features.memoryVault) return null;

  const lagoUrl = process.env.LAGO_URL;
  if (!lagoUrl) return null;

  const userId = session?.user?.id;
  const email = session?.user?.email;
  if (!userId || !email) return null;

  try {
    const token = await signLagoJWT({ id: userId, email });
    return new LagoVaultBackend(lagoUrl, token);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Layer 2: User vault (auto-memory via Lago)
// ---------------------------------------------------------------------------

async function searchUserVault(
  query: string,
  session?: ToolSession,
  maxResults = 5,
): Promise<ContextResult[]> {
  const backend = await getUserLagoBackend(session);
  if (!backend) return [];

  try {
    const results = await backend.search(query, { maxResults });
    return results.map((r) => ({
      name: r.name,
      path: r.path,
      excerpt: r.excerpts.length > 0 ? r.excerpts.join("\n") : "",
      score: r.score,
    }));
  } catch (error) {
    log.error({ err: error, query }, "User vault search failed (layer 2)");
    return [];
  }
}

// ---------------------------------------------------------------------------
// Layer 3: Episodic memory (site-content session in Lago)
// ---------------------------------------------------------------------------

async function searchSiteContent(
  query: string,
  maxResults = 5,
): Promise<ContextResult[]> {
  const lagoUrl = process.env.LAGO_URL;
  if (!lagoUrl) return [];

  try {
    const res = await fetch(
      `${lagoUrl}/v1/sessions/site-content:public/manifest?branch=main`,
    );
    if (!res.ok) return [];

    const data = (await res.json()) as {
      entries: Array<{ path: string; blob_hash: string }>;
    };

    const queryLower = query.toLowerCase();
    const terms = queryLower.split(/\s+/).filter(Boolean);
    if (terms.length === 0) return [];

    const matches = data.entries
      .filter(
        (entry) =>
          entry.path.endsWith(".md") || entry.path.endsWith(".mdx"),
      )
      .map((entry) => {
        const name =
          entry.path.split("/").pop()?.replace(/\.(md|mdx)$/, "") ?? "";
        const pathLower = entry.path.toLowerCase();
        const nameLower = name.toLowerCase();

        let score = 0;
        for (const term of terms) {
          if (nameLower.includes(term)) score += 3;
          else if (pathLower.includes(term)) score += 1;
        }
        return { name, path: entry.path, score };
      })
      .filter((m) => m.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);

    return matches.map((m) => ({
      name: m.name,
      path: m.path,
      excerpt: "", // manifest-only search — no body content available
      score: m.score,
    }));
  } catch (error) {
    log.error({ err: error, query }, "Site content search failed (layer 3)");
    return [];
  }
}

// ---------------------------------------------------------------------------
// Layer 4: Knowledge graph (server vault via VAULT_PATH)
// ---------------------------------------------------------------------------

function searchKnowledgeGraph(
  query: string,
  maxResults = 5,
): ContextResult[] {
  const vaultPath = getVaultPath();
  if (!vaultPath) return [];

  try {
    const results = searchVault(query, vaultPath, { maxResults });
    return results.map((r) => ({
      name: r.note.name,
      path: r.note.relativePath,
      excerpt: r.excerpts.length > 0 ? r.excerpts.join("\n") : "",
      score:
        r.excerpts.length + (r.links.length > 0 ? 1 : 0),
    }));
  } catch (error) {
    log.error(
      { err: error, query },
      "Knowledge graph search failed (layer 4)",
    );
    return [];
  }
}

// ---------------------------------------------------------------------------
// Merge and deduplicate
// ---------------------------------------------------------------------------

/**
 * Deduplicate results across layers by normalized path.
 * When duplicates exist, keep the one with the higher score.
 */
function deduplicateResults(layers: ContextLayer[]): ContextLayer[] {
  const globalSeen = new Map<string, { source: ContextSource; score: number }>();

  // First pass: find the best score per path across all layers
  for (const layer of layers) {
    for (const result of layer.results) {
      const key = result.path.toLowerCase();
      const existing = globalSeen.get(key);
      if (!existing || result.score > existing.score) {
        globalSeen.set(key, { source: layer.source, score: result.score });
      }
    }
  }

  // Second pass: keep results only in their winning layer
  return layers.map((layer) => ({
    source: layer.source,
    results: layer.results.filter((result) => {
      const key = result.path.toLowerCase();
      const winner = globalSeen.get(key);
      return winner?.source === layer.source;
    }),
  }));
}

// ---------------------------------------------------------------------------
// Main assembler
// ---------------------------------------------------------------------------

/**
 * Query all available consciousness stack layers and return ranked,
 * deduplicated results with source attribution.
 *
 * Layer 1 (working memory) is handled by the AI SDK context window
 * and is not queried here.
 *
 * Each layer degrades gracefully: if unavailable, it returns an empty
 * result set and does not block the other layers.
 */
export async function assembleContext(
  query: string,
  options: AssembleContextOptions = {},
): Promise<ContextLayer[]> {
  const { session, maxResultsPerLayer = 5 } = options;

  // Run all layer queries concurrently
  const [userVaultResults, siteContentResults] = await Promise.all([
    searchUserVault(query, session, maxResultsPerLayer),
    searchSiteContent(query, maxResultsPerLayer),
  ]);

  // Knowledge graph search is synchronous (filesystem-based)
  const knowledgeGraphResults = searchKnowledgeGraph(
    query,
    maxResultsPerLayer,
  );

  const layers: ContextLayer[] = [
    {
      source: "user_vault",
      results: userVaultResults,
    },
    {
      source: "site_content",
      results: siteContentResults,
    },
    {
      source: "knowledge_graph",
      results: knowledgeGraphResults,
    },
  ];

  // Filter out empty layers and deduplicate cross-layer
  const nonEmpty = layers.filter((l) => l.results.length > 0);
  if (nonEmpty.length === 0) return [];

  const deduplicated = deduplicateResults(nonEmpty);

  // Sort results within each layer by score descending
  for (const layer of deduplicated) {
    layer.results.sort((a, b) => b.score - a.score);
  }

  // Return only layers that still have results after dedup
  return deduplicated.filter((l) => l.results.length > 0);
}
