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
    `https://api.github.com/users/${username}/repos?type=owner&sort=pushed&direction=desc&per_page=${limit}`,
    { headers },
  );

  if (!res.ok) {
    console.error(`GitHub API error: ${res.status} ${res.statusText}`);
    return [];
  }

  const repos: GitHubRepo[] = await res.json();
  return repos.filter((r) => r.name !== username);
}

const ONE_WEEK = 60 * 60 * 24 * 7;

export const getRecentRepos = unstable_cache(
  (username: string, limit: number) =>
    fetchRecentPublicRepos(username, limit),
  ["github-recent-repos"],
  { revalidate: ONE_WEEK },
);
