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

// ─── Dynamic Skills Roster ───────────────────────────────────────────────────

/** Layer metadata keyed by GitHub topic */
const LAYER_META: Record<string, { id: string; name: string; description: string; order: number }> = {
  "bstack-foundation": {
    id: "foundation",
    name: "Foundation",
    description: "Control, governance, and workflow structure for safe agent operation.",
    order: 1,
  },
  "bstack-memory": {
    id: "memory",
    name: "Memory & Consciousness",
    description: "Persistent context across sessions — governance, knowledge graph, and episodic memory.",
    order: 2,
  },
  "bstack-orchestration": {
    id: "orchestration",
    name: "Orchestration",
    description: "Agent dispatch, project scaffolding, and self-improvement loops.",
    order: 3,
  },
  "bstack-research": {
    id: "research",
    name: "Research & Intelligence",
    description: "Multi-source research, skills inventory, and content generation.",
    order: 4,
  },
  "bstack-design": {
    id: "design",
    name: "Design & Implementation",
    description: "Broomva design system and production-grade project templates.",
    order: 5,
  },
  "bstack-platform": {
    id: "platform",
    name: "Platform Specialties",
    description: "Domain-specific decision tools and content pipelines.",
    order: 6,
  },
};

interface SkillFrontmatter {
  name: string;
  description: string;
}

function parseSkillFrontmatter(content: string): SkillFrontmatter | null {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return null;
  const block = match[1];

  const nameMatch = block.match(/^name:\s*(.+)$/m);
  const descMatch = block.match(/^description:\s*>?\s*\n?([\s\S]*?)(?=\n\w|\n---)/);

  if (!nameMatch) return null;

  const name = nameMatch[1].trim();
  const description = descMatch
    ? descMatch[1].replace(/\n\s*/g, " ").trim()
    : "";

  return { name, description };
}

import type { BstackLayer, BstackSkill } from "@/lib/skills-data";

async function fetchSkillsFromGitHub(username: string): Promise<BstackLayer[]> {
  const headers: HeadersInit = {
    Accept: "application/vnd.github+json",
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  // Fetch all repos
  const res = await fetch(
    `https://api.github.com/users/${username}/repos?type=owner&sort=pushed&direction=desc&per_page=100`,
    { headers },
  );
  if (!res.ok) return [];

  const repos: GitHubRepo[] = await res.json();

  // Filter repos that have a bstack-* topic
  const bstackRepos = repos.filter((r) =>
    r.topics.some((t) => t.startsWith("bstack-")),
  );

  // Fetch SKILL.md for each repo (in parallel, with concurrency limit)
  const skills: Array<{ repo: GitHubRepo; frontmatter: SkillFrontmatter; layer: string }> = [];

  await Promise.all(
    bstackRepos.map(async (repo) => {
      try {
        const fileRes = await fetch(
          `https://api.github.com/repos/${username}/${repo.name}/contents/SKILL.md`,
          { headers },
        );
        if (!fileRes.ok) return;

        const fileData = await fileRes.json();
        const content = Buffer.from(fileData.content, "base64").toString("utf-8");
        const frontmatter = parseSkillFrontmatter(content);
        if (!frontmatter) return;

        const layerTopic = repo.topics.find((t) => t.startsWith("bstack-"));
        if (!layerTopic) return;

        skills.push({ repo, frontmatter, layer: layerTopic });
      } catch {
        // Skip repos where SKILL.md can't be fetched
      }
    }),
  );

  // Group by layer
  const layerMap = new Map<string, BstackSkill[]>();
  for (const { repo, frontmatter, layer } of skills) {
    const list = layerMap.get(layer) ?? [];
    list.push({
      slug: repo.name,
      name: frontmatter.name,
      description: frontmatter.description.slice(0, 200),
      installCommand: `npx skills add ${username}/${repo.name}`,
      skillsUrl: `https://skills.sh/${username}/${repo.name}`,
    });
    layerMap.set(layer, list);
  }

  // Build layers in order
  const layers: BstackLayer[] = [];
  const sortedTopics = [...layerMap.keys()].sort(
    (a, b) => (LAYER_META[a]?.order ?? 99) - (LAYER_META[b]?.order ?? 99),
  );

  for (const topic of sortedTopics) {
    const meta = LAYER_META[topic];
    if (!meta) continue;
    layers.push({
      id: meta.id,
      name: meta.name,
      description: meta.description,
      skills: layerMap.get(topic) ?? [],
    });
  }

  return layers;
}

export const getSkillsRoster = unstable_cache(
  (username: string) => fetchSkillsFromGitHub(username),
  ["github-skills-roster"],
  { revalidate: ONE_WEEK },
);
