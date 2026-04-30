import fs from "node:fs/promises";
import path from "node:path";
import { cacheLife } from "next/cache";
import matter from "gray-matter";
import { remark } from "remark";
import remarkGfm from "remark-gfm";
import remarkHtml from "remark-html";
import {
  rewriteAssetUrl,
  rewriteAssetUrls,
  rewriteMarkdownAssets,
} from "./lago-assets";

export type ContentKind = "notes" | "projects" | "writing" | "prompts";

export interface PromptVariable {
  name: string;
  description: string;
  default?: string;
}

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
  image?: string;
  audio?: string;
  category?: string;
  model?: string;
  version?: string;
  variables?: PromptVariable[];
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
  readingTime?: number;
  image?: string;
  audio?: string;
  category?: string;
  model?: string;
  version?: string;
  variables?: PromptVariable[];
  copyCount?: number;
  isHighlighted?: boolean;
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

  const variables = Array.isArray(frontmatter.variables)
    ? frontmatter.variables.filter(
        (v): v is PromptVariable =>
          typeof v?.name === "string" && typeof v?.description === "string",
      )
    : undefined;

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
    image: typeof frontmatter.image === "string" ? frontmatter.image : undefined,
    audio: typeof frontmatter.audio === "string" ? frontmatter.audio : undefined,
    category: frontmatter.category,
    model: frontmatter.model,
    version: frontmatter.version,
    variables,
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
  "use cache";
  cacheLife("hours");
  const files = await readDirectory(kind);

  const entries = await Promise.all(
    files.map(async (fileName) => {
      const slug = fileName.replace(/\.(md|mdx)$/, "");
      const raw = await readFile(kind, slug);
      if (!raw) return null;

      const parsed = matter(raw);
      const summary = toSummary(kind, slug, parsed.data as ContentFrontmatter);
      summary.readingTime = estimateReadingTime(parsed.content);
      return summary;
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
  "use cache";
  cacheLife("hours");
  const raw = await readFile(kind, slug);
  if (!raw) return null;

  const parsed = matter(raw);
  const summary = toSummary(kind, slug, parsed.data as ContentFrontmatter);
  if (!summary.published) return null;

  // Rewrite asset URLs in markdown before rendering
  const rewrittenContent = rewriteMarkdownAssets(parsed.content);

  const processed = await remark()
    .use(remarkGfm)
    .use(remarkHtml, { sanitize: false })
    .process(rewrittenContent);

  // Rewrite any remaining asset URLs in rendered HTML
  let html = rewriteAssetUrls(processed.toString());

  // Unwrap <video> tags from <p> — remark treats <video> as inline HTML
  // and wraps it in <p>, which is invalid and breaks rendering on iOS Safari
  html = html.replace(
    /<p>(<video\s[^>]*>(?:<\/video>)?)<\/p>/g,
    "$1",
  );

  html = optimizeProseImages(html);

  // Rewrite frontmatter image/audio URLs
  if (summary.image) {
    summary.image = rewriteAssetUrl(summary.image);
  }
  if (summary.audio) {
    summary.audio = rewriteAssetUrl(summary.audio);
  }

  return {
    ...summary,
    readingTime: estimateReadingTime(parsed.content),
    content: rewrittenContent,
    html,
  };
}

/**
 * Rewrite <img src="/images/..."> tags in rendered HTML to use Next.js's
 * /_next/image proxy with width/srcset hints. The first image becomes the
 * LCP candidate (loading="eager", fetchpriority="high"); subsequent images
 * stay lazy. This is server-side so the SSR HTML ships optimized URLs and
 * the browser never makes a wasted request to the raw asset.
 *
 * Idempotent: tags that already carry a srcset are left untouched.
 */
function optimizeProseImages(html: string): string {
  const widths = [640, 828, 1200] as const;
  let index = 0;
  return html.replace(
    /<img\b([^>]*?)\ssrc=(["'])(\/images\/[^"']+)\2([^>]*?)\/?>/g,
    (match, before: string, _quote: string, src: string, after: string) => {
      const tail = `${before} ${after}`;
      if (/\bsrcset=/.test(tail)) {
        return match;
      }
      const encoded = encodeURIComponent(src);
      const srcset = widths
        .map((w) => `/_next/image?url=${encoded}&w=${w}&q=80 ${w}w`)
        .join(", ");
      const optimizedSrc = `/_next/image?url=${encoded}&w=1200&q=80`;
      const sizes = '(max-width: 768px) 100vw, 800px';
      const isFirst = index === 0;
      index += 1;
      const loadingAttr = isFirst
        ? 'loading="eager" fetchpriority="high" decoding="async"'
        : 'loading="lazy" decoding="async"';
      return `<img${before} src="${optimizedSrc}" srcset="${srcset}" sizes="${sizes}" ${loadingAttr}${after}>`;
    },
  );
}

export function estimateReadingTime(content: string): number {
  const text = content.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
  const words = text.split(" ").length;
  return Math.max(1, Math.round(words / 230));
}

export async function getLatest(
  kind: ContentKind,
  limit = 3,
): Promise<ContentSummary[]> {
  "use cache";
  cacheLife("hours");
  const list = await getContentList(kind);
  return list.slice(0, limit);
}

export async function getPinnedProjects(
  limit = 3,
): Promise<ContentSummary[]> {
  "use cache";
  cacheLife("hours");
  const projects = await getContentList("projects");
  const pinned = projects.filter((project) => project.pinned);
  return pinned.slice(0, limit);
}

export async function getAllSlugs(kind: ContentKind): Promise<string[]> {
  "use cache";
  cacheLife("hours");
  const list = await getContentList(kind);
  return list.map((item) => item.slug);
}

export function extractWikilinks(md: string): string[] {
  const matches = [...md.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)];
  return matches.map((m) => m[1].trim());
}
