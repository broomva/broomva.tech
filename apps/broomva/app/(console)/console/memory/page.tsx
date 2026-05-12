"use client";

import { Loader2, Search } from "lucide-react";
import { useCallback, useState } from "react";

import type { MemorySearchResult } from "@/lib/console/types";

export default function MemoryPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MemorySearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setSearched(true);

    try {
      const res = await fetch("/api/memory/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim(), limit: 20 }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? `Search failed (${res.status})`);
        setResults([]);
        return;
      }

      const data = await res.json();
      // Normalize response — Lago may return { results: [...] } or an array
      const items: MemorySearchResult[] = Array.isArray(data)
        ? data
        : data.results ?? [];
      setResults(items);
    } catch {
      setError("Network error");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [query]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Memory</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Search the knowledge graph via Lago.
        </p>
      </div>

      {/* Search bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSearch();
        }}
        className="flex gap-3"
      >
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search memories..."
            className="w-full rounded-lg border border-[var(--ag-border-default)] bg-bg-surface py-2 pl-10 pr-4 text-sm text-text-primary placeholder:text-text-muted focus:border-ai-blue focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="glass-button-primary glass-button"
        >
          {loading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            "Search"
          )}
        </button>
      </form>

      {/* Results */}
      {error && (
        <div className="glass-card text-center text-text-secondary">
          {error}
        </div>
      )}

      {!error && searched && !loading && results.length === 0 && (
        <div className="glass-card text-center text-text-secondary">
          No results found for &ldquo;{query}&rdquo;.
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-3">
          {results.map((result) => (
            <div key={result.id} className="glass-card">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-text-muted">
                  {result.id}
                </span>
                <span className="glass-badge">
                  {(result.score * 100).toFixed(0)}% match
                </span>
              </div>
              <p className="mt-2 text-sm text-text-primary leading-relaxed">
                {result.content}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
