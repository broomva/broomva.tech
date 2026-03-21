/**
 * Lago asset URL rewriting for blog content.
 *
 * Replaces local static asset paths (e.g., /images/writing/foo/hero.png)
 * with Lago-served URLs (/api/assets/images/writing/foo/hero.png).
 *
 * Falls back to local paths when LAGO_URL is not configured.
 */

const LAGO_URL = process.env.LAGO_URL;

/** Asset path prefixes that should be rewritten to Lago. */
const REWRITABLE_PREFIXES = [
  "/images/writing/",
  "/audio/writing/",
  "/images/projects/",
  "/audio/projects/",
  "/audio/notes/",
];

/** Paths that should always stay local (brand assets, favicon, etc.). */
const LOCAL_ONLY_PREFIXES = ["/images/brand/", "/favicon", "/icon"];

/**
 * Check if an asset path should be served from Lago.
 */
function isRewritable(path: string): boolean {
  if (LOCAL_ONLY_PREFIXES.some((prefix) => path.startsWith(prefix))) {
    return false;
  }
  return REWRITABLE_PREFIXES.some((prefix) => path.startsWith(prefix));
}

/**
 * Rewrite a single asset URL to use the Lago proxy route.
 *
 * Returns the original path unchanged if:
 * - LAGO_URL is not configured
 * - The path is not in a rewritable prefix
 * - The path is a brand/local-only asset
 */
export function rewriteAssetUrl(path: string): string {
  if (!LAGO_URL || !isRewritable(path)) {
    return path;
  }
  // Route through the Next.js proxy for edge caching
  return `/api/assets${path}`;
}

/**
 * Rewrite all asset URLs in HTML content.
 *
 * Scans for src="..." and href="..." attributes pointing to
 * rewritable asset paths and replaces them with Lago proxy URLs.
 */
export function rewriteAssetUrls(html: string): string {
  if (!LAGO_URL) return html;

  // Match src="..." and href="..." with local asset paths
  return html.replace(
    /((?:src|href|poster)=["'])(\/(images|audio)\/(writing|projects|notes)\/[^"']+)(["'])/g,
    (_match, prefix, path, _dir, _kind, suffix) => {
      const newPath = rewriteAssetUrl(path);
      return `${prefix}${newPath}${suffix}`;
    }
  );
}

/**
 * Rewrite asset URLs in MDX/markdown content (before rendering).
 *
 * Handles markdown image syntax: ![alt](/images/writing/...)
 * and HTML img tags within MDX.
 */
export function rewriteMarkdownAssets(markdown: string): string {
  if (!LAGO_URL) return markdown;

  // Markdown images: ![alt](/images/...)
  let result = markdown.replace(
    /!\[([^\]]*)\]\((\/(images|audio)\/(writing|projects|notes)\/[^)]+)\)/g,
    (_match, alt, path) => {
      const newPath = rewriteAssetUrl(path);
      return `![${alt}](${newPath})`;
    }
  );

  // HTML tags in MDX
  result = rewriteAssetUrls(result);

  return result;
}
