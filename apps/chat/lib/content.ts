import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { remark } from "remark";
import remarkHtml from "remark-html";

export type ContentKind = "notes" | "projects" | "writing";

interface ContentFrontmatter {
  title?: string;
  summary?: string;
  date?: string | Date;
  published?: boolean;
  pinned?: boolean;
  status?: string;
  tags?: string[];
  links?: Array<{
    label: string;
    url: string;
  }>;
}

export interface ContentSummary {
  title: string;
  summary: string;
  date: string;
  slug: string;
  kind: ContentKind;
  published: boolean;
  pinned: boolean;
  status?: string;
  tags: string[];
  links: Array<{
    label: string;
    url: string;
  }>;
}

export interface ContentDocument extends ContentSummary {
  content: string;
  html: string;
}

const CONTENT_ROOT = path.join(process.cwd(), "content");

function toTimestamp(value: string): number {
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function normalizeDate(value: string | Date | undefined): string {
  if (!value) {
    return new Date().toISOString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return value;
}

async function readDirectory(kind: ContentKind): Promise<string[]> {
  try {
    const files = await fs.readdir(path.join(CONTENT_ROOT, kind));
    return files.filter((file) => /\.(md|mdx)$/.test(file));
  } catch (error: unknown) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return [];
    }
    throw error;
  }
}

function toSummary(
  kind: ContentKind,
  slug: string,
  frontmatter: ContentFrontmatter,
): ContentSummary {
  const title = frontmatter.title ?? slug;
  const summary = frontmatter.summary ?? "";
  const date = normalizeDate(frontmatter.date);
  const tags = Array.isArray(frontmatter.tags)
    ? frontmatter.tags.filter((tag): tag is string => typeof tag === "string")
    : [];
  const links = Array.isArray(frontmatter.links)
    ? frontmatter.links.filter(
        (link): link is { label: string; url: string } =>
          typeof link?.label === "string" && typeof link?.url === "string",
      )
    : [];

  return {
    title,
    summary,
    date,
    slug,
    kind,
    published: frontmatter.published ?? true,
    pinned: frontmatter.pinned ?? false,
    status: frontmatter.status,
    tags,
    links,
  };
}

async function readFile(
  kind: ContentKind,
  slug: string,
): Promise<string | null> {
  const fullPath = path.join(CONTENT_ROOT, kind, `${slug}.mdx`);

  try {
    return await fs.readFile(fullPath, "utf8");
  } catch (error: unknown) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return null;
    }
    throw error;
  }
}

export async function getContentList(
  kind: ContentKind,
): Promise<ContentSummary[]> {
  const files = await readDirectory(kind);

  const entries = await Promise.all(
    files.map(async (fileName) => {
      const slug = fileName.replace(/\.(md|mdx)$/, "");
      const raw = await readFile(kind, slug);
      if (!raw) return null;

      const parsed = matter(raw);
      return toSummary(kind, slug, parsed.data as ContentFrontmatter);
    }),
  );

  return entries
    .filter((entry): entry is ContentSummary => Boolean(entry?.published))
    .sort((a, b) => toTimestamp(b.date) - toTimestamp(a.date));
}

export async function getContentBySlug(
  kind: ContentKind,
  slug: string,
): Promise<ContentDocument | null> {
  const raw = await readFile(kind, slug);
  if (!raw) return null;

  const parsed = matter(raw);
  const summary = toSummary(kind, slug, parsed.data as ContentFrontmatter);
  if (!summary.published) return null;

  const processed = await remark().use(remarkHtml).process(parsed.content);

  return {
    ...summary,
    content: parsed.content,
    html: processed.toString(),
  };
}

export async function getLatest(
  kind: ContentKind,
  limit = 3,
): Promise<ContentSummary[]> {
  const list = await getContentList(kind);
  return list.slice(0, limit);
}

export async function getPinnedProjects(
  limit = 3,
): Promise<ContentSummary[]> {
  const projects = await getContentList("projects");
  const pinned = projects.filter((project) => project.pinned);
  return pinned.slice(0, limit);
}

export async function getAllSlugs(kind: ContentKind): Promise<string[]> {
  const list = await getContentList(kind);
  return list.map((item) => item.slug);
}
