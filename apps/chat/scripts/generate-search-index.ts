/**
 * Build-time script: generates public/search-index.json from all site content.
 *
 * Sources:
 *   1. MDX content  — writing, notes, projects, prompts (via lib/content.ts)
 *   2. Skills       — static BSTACK_LAYERS (no GitHub API needed)
 *   3. GitHub repos  — via GitHub API (graceful fallback if no token)
 *   4. Static pages  — hardcoded entries for non-content routes
 *
 * Usage:  bun scripts/generate-search-index.ts
 * Wired:  prebuild hook + vercel.json buildCommand + CI step
 */

import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";

// ── Types ────────────────────────────────────────────────────────────────────

interface SearchEntry {
  id: string;
  title: string;
  summary: string;
  kind: string;
  href: string;
  tags: string[];
  category?: string;
}

type ContentKind = "notes" | "projects" | "writing" | "prompts";

// ── MDX content (reimplemented to avoid Next.js server imports) ──────────────

const CONTENT_ROOT = path.join(process.cwd(), "content");
const CONTENT_KINDS: ContentKind[] = ["writing", "notes", "projects", "prompts"];

async function readMdxEntries(kind: ContentKind): Promise<SearchEntry[]> {
  let files: string[];
  try {
    files = (await fs.readdir(path.join(CONTENT_ROOT, kind))).filter((f) =>
      /\.(md|mdx)$/.test(f),
    );
  } catch {
    return [];
  }

  const entries: SearchEntry[] = [];

  for (const file of files) {
    const slug = file.replace(/\.(md|mdx)$/, "");
    const raw = await fs.readFile(path.join(CONTENT_ROOT, kind, file), "utf8");
    const { data } = matter(raw);

    if (data.published === false) continue;

    const tags = Array.isArray(data.tags)
      ? data.tags.filter((t: unknown): t is string => typeof t === "string")
      : [];

    entries.push({
      id: `${kind}/${slug}`,
      title: data.title ?? slug,
      summary: data.summary ?? "",
      kind,
      href: `/${kind}/${slug}`,
      tags,
      category: data.category,
    });
  }

  return entries;
}

// ── Skills (static data, no API call) ────────────────────────────────────────

interface BstackSkill {
  slug: string;
  name: string;
  description: string;
}
interface BstackLayer {
  id: string;
  name: string;
  skills: BstackSkill[];
}

async function readSkillEntries(): Promise<SearchEntry[]> {
  const mod = await import("../lib/skills-data.js");
  const layers: BstackLayer[] = mod.BSTACK_LAYERS;

  return layers.flatMap((layer) =>
    layer.skills.map((skill) => ({
      id: `skill/${skill.slug}`,
      title: skill.name,
      summary: skill.description,
      kind: "skill",
      href: `/skills#${skill.slug}`,
      tags: [layer.id],
      category: layer.name,
    })),
  );
}

// ── GitHub repos (optional, graceful fallback) ───────────────────────────────

interface GitHubRepo {
  name: string;
  description: string | null;
  html_url: string;
  topics: string[];
}

async function readGitHubEntries(): Promise<SearchEntry[]> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.log("  ⏭  GITHUB_TOKEN not set — skipping GitHub repos");
    return [];
  }

  try {
    const res = await fetch(
      "https://api.github.com/users/broomva/repos?type=owner&sort=pushed&direction=desc&per_page=20",
      {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
        },
      },
    );

    if (!res.ok) {
      console.log(`  ⏭  GitHub API returned ${res.status} — skipping`);
      return [];
    }

    const repos: GitHubRepo[] = await res.json();
    return repos
      .filter((r) => r.name !== "broomva")
      .slice(0, 10)
      .map((repo) => ({
        id: `repo/${repo.name}`,
        title: repo.name,
        summary: repo.description ?? "",
        kind: "repo",
        href: repo.html_url,
        tags: repo.topics,
      }));
  } catch (err) {
    console.log(`  ⏭  GitHub fetch failed: ${err} — skipping`);
    return [];
  }
}

// ── Static pages ─────────────────────────────────────────────────────────────

function staticPageEntries(): SearchEntry[] {
  return [
    {
      id: "page/home",
      title: "Home",
      summary: "BroomVA — AI engineer, agent architect, builder.",
      kind: "page",
      href: "/",
      tags: [],
    },
    {
      id: "page/writing",
      title: "Writing",
      summary: "Essays on AI, agent systems, and building in public.",
      kind: "page",
      href: "/writing",
      tags: ["blog", "essays"],
    },
    {
      id: "page/projects",
      title: "Projects",
      summary: "Open-source projects and tools.",
      kind: "page",
      href: "/projects",
      tags: ["open-source"],
    },
    {
      id: "page/skills",
      title: "Skills",
      summary: "The Broomva Stack — 24 agent skills across 7 layers.",
      kind: "page",
      href: "/skills",
      tags: ["bstack", "agent-skills"],
    },
    {
      id: "page/prompts",
      title: "Prompts",
      summary: "Versioned, parameterized prompt library.",
      kind: "page",
      href: "/prompts",
      tags: ["prompts", "ai"],
    },
    {
      id: "page/links",
      title: "Links",
      summary: "Key links, profiles, and deployment inventory.",
      kind: "page",
      href: "/links",
      tags: ["links", "profiles"],
    },
    {
      id: "page/now",
      title: "Now",
      summary: "What I'm focused on right now.",
      kind: "page",
      href: "/now",
      tags: ["now"],
    },
    {
      id: "page/contact",
      title: "Contact",
      summary: "Get in touch.",
      kind: "page",
      href: "/contact",
      tags: ["contact"],
    },
  ];
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("Generating search index...");

  const [mdxResults, skills, repos] = await Promise.all([
    Promise.all(CONTENT_KINDS.map(readMdxEntries)).then((a) => a.flat()),
    readSkillEntries(),
    readGitHubEntries(),
  ]);

  const staticPages = staticPageEntries();
  const all = [...mdxResults, ...skills, ...repos, ...staticPages];

  const outPath = path.join(process.cwd(), "public", "search-index.json");
  const json = JSON.stringify(all);
  await fs.writeFile(outPath, json, "utf8");

  const bytes = Buffer.byteLength(json, "utf8");
  console.log(
    `  ✓ ${all.length} entries (${(bytes / 1024).toFixed(1)} KB) → public/search-index.json`,
  );
  console.log(
    `    MDX: ${mdxResults.length}, Skills: ${skills.length}, Repos: ${repos.length}, Pages: ${staticPages.length}`,
  );
}

main().catch((err) => {
  console.error("Search index generation failed:", err);
  process.exit(1);
});
