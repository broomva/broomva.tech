"use client";

import Fuse, { type IFuseOptions } from "fuse.js";
import { useEffect, useMemo, useRef, useState } from "react";

export interface SearchEntry {
  id: string;
  title: string;
  summary: string;
  kind: string;
  href: string;
  tags: string[];
  category?: string;
}

let cachedEntries: SearchEntry[] | null = null;
let fetchPromise: Promise<SearchEntry[]> | null = null;

function loadIndex(): Promise<SearchEntry[]> {
  if (cachedEntries) return Promise.resolve(cachedEntries);
  if (fetchPromise) return fetchPromise;

  fetchPromise = fetch("/search-index.json")
    .then((res) => {
      if (!res.ok) throw new Error(`Search index fetch failed: ${res.status}`);
      return res.json() as Promise<SearchEntry[]>;
    })
    .then((data) => {
      cachedEntries = data;
      return data;
    })
    .catch((err) => {
      console.warn("Failed to load search index:", err);
      fetchPromise = null;
      return [];
    });

  return fetchPromise;
}

const FUSE_OPTIONS: IFuseOptions<SearchEntry> = {
  keys: [
    { name: "title", weight: 1.0 },
    { name: "tags", weight: 0.7 },
    { name: "summary", weight: 0.5 },
    { name: "kind", weight: 0.3 },
    { name: "category", weight: 0.3 },
  ],
  threshold: 0.4,
  includeScore: true,
  minMatchCharLength: 1,
};

export function useSearchIndex() {
  const [entries, setEntries] = useState<SearchEntry[]>(cachedEntries ?? []);
  const [isReady, setIsReady] = useState(cachedEntries !== null);
  const fuseRef = useRef<Fuse<SearchEntry> | null>(null);

  useEffect(() => {
    if (cachedEntries) {
      setEntries(cachedEntries);
      setIsReady(true);
      return;
    }

    loadIndex().then((data) => {
      setEntries(data);
      setIsReady(true);
    });
  }, []);

  const fuse = useMemo(() => {
    if (entries.length === 0) return null;
    const instance = new Fuse(entries, FUSE_OPTIONS);
    fuseRef.current = instance;
    return instance;
  }, [entries]);

  const search = useMemo(() => {
    return (query: string): SearchEntry[] => {
      if (!query.trim()) return entries.slice(0, 12);
      if (!fuse) return [];
      return fuse.search(query, { limit: 12 }).map((r) => r.item);
    };
  }, [fuse, entries]);

  return { search, isReady, entries };
}
