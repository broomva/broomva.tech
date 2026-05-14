import { cacheLife } from "next/cache";

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
  "use cache";
  cacheLife("weeks");
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

export async function getRecentRepos(
  username: string,
  limit: number,
): Promise<GitHubRepo[]> {
  return fetchRecentPublicRepos(username, limit);
}

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
  "bstack-primitive": {
    id: "primitive",
    name: "Bstack Primitives",
    description: "Workspace-governance primitives (P14–P19+): reasoning, format, orchestration, lens routing.",
    order: 7,
  },
  // Fallback layer for skill repos without a bstack-* topic (the common case
  // for newer skills, persona-* skills, content/research/strategy clusters).
  __uncategorized__: {
    id: "uncategorized",
    name: "Other Skills",
    description: "Additional broomva/* skills without an explicit bstack-* layer tag.",
    order: 99,
  },
};

/** Heuristic layer derivation when a repo doesn't have a bstack-* topic.
 *  Keeps the page coherent even when topic taxonomy is inconsistent across repos. */
function deriveLayerFromTopics(topics: string[]): string {
  if (topics.includes("bstack-primitive")) return "bstack-primitive";
  if (topics.some((t) => t.startsWith("bstack-"))) {
    return topics.find((t) => t.startsWith("bstack-")) ?? "__uncategorized__";
  }
  // Heuristics for repos without bstack-* tags
  if (topics.some((t) => ["agent-os", "agent-framework", "agent-runtime"].includes(t))) return "bstack-foundation";
  if (topics.some((t) => ["agent-skill", "skills", "skills-sh"].includes(t))) return "__uncategorized__";
  return "__uncategorized__";
}

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
  "use cache";
  cacheLife("hours");
  const headers: HeadersInit = {
    Accept: "application/vnd.github+json",
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  // Fetch all owner repos (paginated; 100/page max from GitHub)
  const res = await fetch(
    `https://api.github.com/users/${username}/repos?type=owner&sort=pushed&direction=desc&per_page=100`,
    { headers },
  );
  if (!res.ok) return [];

  const repos: GitHubRepo[] = await res.json();

  // Canonical filter: presence of SKILL.md at repo root.
  // Topic tags are inconsistent across the broomva org (agent-skill,
  // agent-skills, bstack-*, or none); SKILL.md is the canonical signal
  // a repo is a published skill.
  //
  // For each repo, attempt to fetch /contents/SKILL.md in parallel.
  // Repos without SKILL.md are silently filtered out (no error noise).
  const skillCandidates: Array<{
    repo: GitHubRepo;
    frontmatter: SkillFrontmatter;
  }> = [];

  await Promise.all(
    repos.map(async (repo) => {
      try {
        const fileRes = await fetch(
          `https://api.github.com/repos/${username}/${repo.name}/contents/SKILL.md`,
          { headers },
        );
        if (!fileRes.ok) return;

        const fileData = await fileRes.json();
        if (!fileData?.content) return;

        const content = Buffer.from(fileData.content, "base64").toString("utf-8");
        const frontmatter = parseSkillFrontmatter(content);
        if (!frontmatter) return;

        skillCandidates.push({ repo, frontmatter });
      } catch {
        // Network/parse errors → skip; failure is silent by design
      }
    }),
  );

  // Group by derived layer (bstack-* topic if present, fallback heuristic)
  const layerMap = new Map<string, BstackSkill[]>();
  for (const { repo, frontmatter } of skillCandidates) {
    const layerKey = deriveLayerFromTopics(repo.topics);
    const list = layerMap.get(layerKey) ?? [];
    list.push({
      slug: repo.name,
      name: frontmatter.name || repo.name,
      description: frontmatter.description.slice(0, 240),
      installCommand: `npx skills add ${username}/${repo.name}`,
      skillsUrl: `https://skills.sh/${username}/${repo.name}`,
      repoUrl: repo.html_url,
      stars: repo.stargazers_count,
      updatedAt: repo.pushed_at,
      topics: repo.topics,
    });
    layerMap.set(layerKey, list);
  }

  // Build layers in order, sorting skills within each layer by stars desc, then name asc
  const layers: BstackLayer[] = [];
  const sortedLayerKeys = [...layerMap.keys()].sort(
    (a, b) => (LAYER_META[a]?.order ?? 99) - (LAYER_META[b]?.order ?? 99),
  );

  for (const key of sortedLayerKeys) {
    const meta = LAYER_META[key];
    if (!meta) continue;
    const skills = (layerMap.get(key) ?? []).sort((a, b) => {
      const starDiff = (b.stars ?? 0) - (a.stars ?? 0);
      if (starDiff !== 0) return starDiff;
      return a.name.localeCompare(b.name);
    });
    layers.push({
      id: meta.id,
      name: meta.name,
      description: meta.description,
      skills,
    });
  }

  return layers;
}

export async function getSkillsRoster(username: string): Promise<BstackLayer[]> {
  return fetchSkillsFromGitHub(username);
}
