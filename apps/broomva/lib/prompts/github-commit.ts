import yaml from "js-yaml";

const GITHUB_OWNER = "broomva";
const GITHUB_REPO = "broomva.tech";
const PROMPTS_PATH = "apps/broomva/content/prompts";

export async function commitPromptToGitHub(prompt: {
  slug: string;
  title: string;
  content: string;
  summary?: string | null;
  category?: string | null;
  model?: string | null;
  version?: string | null;
  tags?: string[] | null;
  variables?: Array<{
    name: string;
    description: string;
    default?: string;
  }> | null;
  links?: Array<{ label: string; url: string }> | null;
}): Promise<{ success: boolean; error?: string }> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return { success: false, error: "GITHUB_TOKEN not set" };
  }

  const filePath = `${PROMPTS_PATH}/${prompt.slug}.mdx`;
  const mdxContent = buildMdx(prompt);

  // Get existing file SHA (needed for updates)
  let sha: string | undefined;
  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
        },
      },
    );
    if (res.ok) {
      const data = await res.json();
      sha = data.sha;
    }
  } catch {
    // File doesn't exist yet, that's fine
  }

  // Create or update file
  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: `chore(prompts): ${sha ? "update" : "add"} ${prompt.slug}`,
        content: Buffer.from(mdxContent).toString("base64"),
        ...(sha && { sha }),
      }),
    },
  );

  if (!res.ok) {
    const err = await res.text();
    return { success: false, error: `GitHub API: ${res.status} ${err}` };
  }
  return { success: true };
}

/**
 * Build the MDX text for a prompt, with frontmatter serialized via `js-yaml`.
 *
 * BRO-1182: An earlier implementation built the YAML frontmatter by
 * hand-rolling `title: "${prompt.title}"` style template literals. If any
 * incoming string contained `"`, `\`, or a newline (which user-authored
 * prompt titles routinely do), the resulting YAML was malformed. Downstream,
 * `gray-matter` (see `apps/broomva/lib/content.ts`) would silently drop the
 * frontmatter, the prompt would vanish from `/prompts`, and the GitHub
 * mirror PUT would still return `{ok: true}` — making the failure invisible
 * end-to-end. The fix is to serialize via a proper YAML emitter so quoting,
 * escaping, and block-vs-flow style are chosen correctly by the emitter
 * instead of the caller.
 *
 * Exported for unit testing (round-trip via `gray-matter.matter()`).
 */
export function buildMdx(prompt: {
  title: string;
  content: string;
  summary?: string | null;
  category?: string | null;
  model?: string | null;
  version?: string | null;
  tags?: string[] | null;
  variables?: Array<{
    name: string;
    description: string;
    default?: string;
  }> | null;
  links?: Array<{ label: string; url: string }> | null;
}): string {
  // Build frontmatter as an object in the canonical key order. js-yaml's
  // `dump` preserves insertion order, so this reproduces the layout of the
  // existing 31 MDX files under `content/prompts/` for the common case.
  const frontmatter: Record<string, unknown> = {};
  frontmatter.title = prompt.title;
  frontmatter.summary = prompt.summary ?? "";
  frontmatter.date = new Date().toISOString().split("T")[0];
  frontmatter.published = true;

  if (prompt.category) frontmatter.category = prompt.category;
  if (prompt.model) frontmatter.model = prompt.model;
  frontmatter.version = prompt.version ?? "1.0";

  if (prompt.tags?.length) {
    frontmatter.tags = prompt.tags;
  }

  if (prompt.variables?.length) {
    frontmatter.variables = prompt.variables.map((v) => {
      const entry: Record<string, string> = {
        name: v.name,
        description: v.description,
      };
      // Preserve prior contract: only emit `default` when it's truthy. The
      // old hand-rolled implementation used `if (v.default)` which drops
      // empty strings, null, and undefined alike. Keep that to make the
      // YAML-serialization migration a pure bugfix for hostile characters
      // (the BRO-1182 failure mode) without expanding the field surface.
      if (v.default) entry.default = v.default;
      return entry;
    });
  }

  if (prompt.links?.length) {
    frontmatter.links = prompt.links.map((l) => ({
      label: l.label,
      url: l.url,
    }));
  }

  // `lineWidth: -1` disables line folding (we want stable round-trips, not
  // pretty wrapping). `noRefs: true` disables YAML anchors/aliases — they
  // would confuse downstream consumers that don't expect them. `quotingType`
  // is "double" with `forceQuotes: false` so the emitter chooses the safest
  // quoting per value (plain when safe, double-quoted with escapes when not).
  // `noCompatMode: true` lets the emitter use modern YAML 1.2 quoting rules.
  const yamlBody = yaml.dump(frontmatter, {
    lineWidth: -1,
    noRefs: true,
    quotingType: '"',
    forceQuotes: false,
    noCompatMode: true,
  });

  return `---\n${yamlBody}---\n\n${prompt.content}\n`;
}
