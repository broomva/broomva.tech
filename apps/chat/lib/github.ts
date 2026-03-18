import { unstable_cache } from "next/cache";

export interface GitHubRepo {
  name: string;
  description: string | null;
  html_url: string;
  stargazers_count: number;
  language: string | null;
  pushed_at: string;
  topics: string[];
}

/** Flagship repos shown first on the landing page, in order. */
const FLAGSHIP_REPOS = [
  "aiOS",
  "symphony",
  "autoany",
  "arcan",
  "harness-engineering",
  "agentic-control-kernel",
];

async function fetchRecentPublicRepos(
  username: string,
  limit: number,
): Promise<GitHubRepo[]> {
  const headers: HeadersInit = {
    Accept: "application/vnd.github+json",
  };

  const token = process.env.GITHUB_TOKEN;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(
    `https://api.github.com/users/${username}/repos?type=owner&sort=pushed&direction=desc&per_page=100`,
    { headers },
  );

  if (!res.ok) {
    console.error(`GitHub API error: ${res.status} ${res.statusText}`);
    return [];
  }

  const repos: GitHubRepo[] = await res.json();
  const filtered = repos.filter((r) => r.name !== username);

  // Put flagship repos first in defined order, then fill with recent
  const flagshipSet = new Set(FLAGSHIP_REPOS.map((n) => n.toLowerCase()));
  const flagship = FLAGSHIP_REPOS.map((name) =>
    filtered.find((r) => r.name.toLowerCase() === name.toLowerCase()),
  ).filter((r): r is GitHubRepo => r !== undefined);

  const rest = filtered.filter(
    (r) => !flagshipSet.has(r.name.toLowerCase()),
  );

  return [...flagship, ...rest].slice(0, limit);
}

const ONE_WEEK = 60 * 60 * 24 * 7;

export const getRecentRepos = unstable_cache(
  (username: string, limit: number) =>
    fetchRecentPublicRepos(username, limit),
  ["github-recent-repos"],
  { revalidate: ONE_WEEK },
);
