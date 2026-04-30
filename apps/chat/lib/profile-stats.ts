import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { cacheLife } from "next/cache";

// ─────────────────────────────────────────────────────────────────────────────
// GitHub aggregate stats
// ─────────────────────────────────────────────────────────────────────────────

export interface GitHubAggregateStats {
  totalStars: number;
  totalRepos: number;
  topRepos: Array<{
    name: string;
    description: string | null;
    stars: number;
    url: string;
    topics: string[];
    pushedAt: string;
    language: string | null;
  }>;
}

async function fetchGitHubAggregate(
  username: string,
): Promise<GitHubAggregateStats> {
  "use cache";
  cacheLife("hours");

  const headers: HeadersInit = { Accept: "application/vnd.github+json" };
  const token = process.env.GITHUB_TOKEN;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    const res = await fetch(
      `https://api.github.com/users/${username}/repos?type=owner&sort=updated&direction=desc&per_page=100`,
      { headers },
    );
    if (!res.ok) {
      return { totalStars: 0, totalRepos: 0, topRepos: [] };
    }
    const repos = (await res.json()) as Array<{
      name: string;
      description: string | null;
      stargazers_count: number;
      html_url: string;
      topics: string[];
      pushed_at: string;
      fork: boolean;
      language: string | null;
    }>;

    const owned = repos.filter((r) => !r.fork);
    const totalStars = owned.reduce((sum, r) => sum + r.stargazers_count, 0);
    const topRepos = owned
      .toSorted((a, b) => b.stargazers_count - a.stargazers_count)
      .slice(0, 6)
      .map((r) => ({
        name: r.name,
        description: r.description,
        stars: r.stargazers_count,
        url: r.html_url,
        topics: r.topics ?? [],
        pushedAt: r.pushed_at,
        language: r.language,
      }));

    return { totalStars, totalRepos: owned.length, topRepos };
  } catch {
    return { totalStars: 0, totalRepos: 0, topRepos: [] };
  }
}

export async function getGitHubAggregate(
  username = "broomva",
): Promise<GitHubAggregateStats> {
  return fetchGitHubAggregate(username);
}

// ─────────────────────────────────────────────────────────────────────────────
// crates.io stats — pull metadata for the Life Agent OS Rust crates
// ─────────────────────────────────────────────────────────────────────────────

export interface CratesAggregateStats {
  totalDownloads: number;
  totalCrates: number;
  topCrates: Array<{
    name: string;
    downloads: number;
    version: string;
    description: string | null;
    updatedAt: string;
    url: string;
  }>;
}

const TARGET_CRATES = [
  "life-vigil",
  "life-spaces",
  "life-aios",
  "life-arcan",
  "life-lago",
  "life-praxis",
  "life-haima",
  "life-autonomic",
  "life-anima",
];

async function fetchCrateMeta(name: string) {
  try {
    const res = await fetch(`https://crates.io/api/v1/crates/${name}`, {
      headers: { "User-Agent": "broomva.tech profile page (carlos@broomva.tech)" },
    });
    if (!res.ok) {
      return null;
    }
    const data = (await res.json()) as {
      crate: {
        name: string;
        downloads: number;
        max_version: string;
        description: string | null;
        updated_at: string;
        homepage: string | null;
        repository: string | null;
      };
    };
    return data.crate;
  } catch {
    return null;
  }
}

async function fetchCratesAggregate(): Promise<CratesAggregateStats> {
  "use cache";
  cacheLife("hours");

  const results = await Promise.all(TARGET_CRATES.map(fetchCrateMeta));
  const found = results.filter((c): c is NonNullable<typeof c> => c !== null);

  const totalDownloads = found.reduce((sum, c) => sum + c.downloads, 0);
  const topCrates = found
    .toSorted((a, b) => b.downloads - a.downloads)
    .map((c) => ({
      name: c.name,
      downloads: c.downloads,
      version: c.max_version,
      description: c.description,
      updatedAt: c.updated_at,
      url: `https://crates.io/crates/${c.name}`,
    }));

  return { totalDownloads, totalCrates: found.length, topCrates };
}

export async function getCratesAggregate(): Promise<CratesAggregateStats> {
  return fetchCratesAggregate();
}

// ─────────────────────────────────────────────────────────────────────────────
// Knowledge graph snapshot (synced from ~/.config/bookkeeping/status.json)
// ─────────────────────────────────────────────────────────────────────────────

export interface BookkeepingSnapshot {
  totalEntities: number;
  topScored: number;
  recentPromotions7d: number;
  lastRun: string;
  byType: Record<string, number>;
}

interface RawBookkeepingStatus {
  total_entities?: number;
  by_type?: Record<string, number>;
  scoring_distribution?: Record<string, number>;
  recent_promotions_7d?: number;
  last_run?: string;
}

async function fetchBookkeepingSnapshot(): Promise<BookkeepingSnapshot | null> {
  "use cache";
  cacheLife("hours");

  try {
    const path = join(process.cwd(), "public", "data", "bookkeeping.json");
    const raw = await readFile(path, "utf-8");
    const data = JSON.parse(raw) as RawBookkeepingStatus;
    const distribution = data.scoring_distribution ?? {};
    const topScored = (distribution["8"] ?? 0) + (distribution["9"] ?? 0);
    return {
      totalEntities: data.total_entities ?? 0,
      topScored,
      recentPromotions7d: data.recent_promotions_7d ?? 0,
      lastRun: data.last_run ?? "",
      byType: data.by_type ?? {},
    };
  } catch {
    return null;
  }
}

export async function getBookkeepingSnapshot(): Promise<BookkeepingSnapshot | null> {
  return fetchBookkeepingSnapshot();
}

// ─────────────────────────────────────────────────────────────────────────────
// Format helpers
// ─────────────────────────────────────────────────────────────────────────────

export function formatNumber(n: number): string {
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(1)}M`;
  }
  if (n >= 1_000) {
    return `${(n / 1_000).toFixed(1)}k`;
  }
  return n.toString();
}

export function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);
  const diffMon = Math.floor(diffDay / 30);
  const diffYr = Math.floor(diffDay / 365);

  if (diffYr >= 1) {
    return `${diffYr}y ago`;
  }
  if (diffMon >= 1) {
    return `${diffMon}mo ago`;
  }
  if (diffDay >= 1) {
    return `${diffDay}d ago`;
  }
  if (diffHr >= 1) {
    return `${diffHr}h ago`;
  }
  return `${Math.max(diffMin, 1)}m ago`;
}
