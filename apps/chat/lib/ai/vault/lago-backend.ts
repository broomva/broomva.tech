/**
 * LagoVaultBackend — stores/retrieves .md files via lagod's /v1/memory/* API.
 *
 * Uses inline fetch() — no separate lago-client-ts package needed.
 * Also exposes server-side search and graph traversal.
 */

import type { VaultBackend } from "./backend";

export type LagoSearchResult = {
  path: string;
  name: string;
  frontmatter: Record<string, unknown>;
  excerpts: string[];
  links: string[];
  score: number;
};

export type LagoTraversalNote = {
  path: string;
  name: string;
  depth: number;
  links: string[];
};

export class LagoVaultBackend implements VaultBackend {
  readonly cacheKey: string;

  constructor(
    private readonly lagoUrl: string,
    private readonly token: string
  ) {
    this.cacheKey = `lago:${lagoUrl}`;
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      "Content-Type": "application/json",
    };
  }

  async listFiles(): Promise<string[]> {
    const res = await fetch(`${this.lagoUrl}/v1/memory/manifest`, {
      headers: this.headers(),
    });

    if (!res.ok) return [];

    const data = (await res.json()) as {
      entries: Array<{ path: string }>;
    };
    return data.entries.map((e) => e.path.replace(/^\//, ""));
  }

  async readFile(relativePath: string): Promise<string | null> {
    const encoded = encodeURIComponent(
      relativePath.startsWith("/") ? relativePath : `/${relativePath}`
    );
    const res = await fetch(
      `${this.lagoUrl}/v1/memory/files/${encoded}`,
      { headers: this.headers() }
    );

    if (!res.ok) return null;
    return res.text();
  }

  async writeFile(relativePath: string, content: string): Promise<void> {
    const path = relativePath.startsWith("/")
      ? relativePath
      : `/${relativePath}`;
    const encoded = encodeURIComponent(path);
    await fetch(`${this.lagoUrl}/v1/memory/files/${encoded}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${this.token}`,
      },
      body: content,
    });
  }

  async deleteFile(relativePath: string): Promise<void> {
    const path = relativePath.startsWith("/")
      ? relativePath
      : `/${relativePath}`;
    const encoded = encodeURIComponent(path);
    await fetch(`${this.lagoUrl}/v1/memory/files/${encoded}`, {
      method: "DELETE",
      headers: this.headers(),
    });
  }

  /** Server-side scored search (bypasses client-side VaultReader.searchVault). */
  async search(
    query: string,
    opts?: { maxResults?: number; followLinks?: boolean }
  ): Promise<LagoSearchResult[]> {
    const res = await fetch(`${this.lagoUrl}/v1/memory/search`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        query,
        max_results: opts?.maxResults,
        follow_links: opts?.followLinks,
      }),
    });

    if (!res.ok) return [];

    const data = (await res.json()) as { results: LagoSearchResult[] };
    return data.results;
  }

  /** Server-side BFS graph traversal. */
  async traverse(
    target: string,
    opts?: { depth?: number; maxNotes?: number }
  ): Promise<LagoTraversalNote[]> {
    const res = await fetch(`${this.lagoUrl}/v1/memory/traverse`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        target,
        depth: opts?.depth,
        max_notes: opts?.maxNotes,
      }),
    });

    if (!res.ok) return [];

    const data = (await res.json()) as { notes: LagoTraversalNote[] };
    return data.notes;
  }

  /** Resolve a wikilink to a full note via lagod. */
  async readNote(name: string): Promise<{
    path: string;
    name: string;
    frontmatter: Record<string, unknown>;
    body: string;
    links: string[];
  } | null> {
    const encoded = encodeURIComponent(name);
    const res = await fetch(
      `${this.lagoUrl}/v1/memory/note/${encoded}`,
      { headers: this.headers() }
    );

    if (!res.ok) return null;
    return res.json() as Promise<{
      path: string;
      name: string;
      frontmatter: Record<string, unknown>;
      body: string;
      links: string[];
    }>;
  }
}
