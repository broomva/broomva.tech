const GITHUB_OWNER = "broomva";
const GITHUB_REPO = "broomva.tech";
const PROMPTS_PATH = "apps/chat/content/prompts";

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

function buildMdx(prompt: {
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
  const lines: string[] = ["---"];
  lines.push(`title: "${prompt.title}"`);
  lines.push(`summary: "${prompt.summary ?? ""}"`);
  lines.push(`date: ${new Date().toISOString().split("T")[0]}`);
  lines.push("published: true");

  if (prompt.category) lines.push(`category: ${prompt.category}`);
  if (prompt.model) lines.push(`model: ${prompt.model}`);
  lines.push(`version: "${prompt.version ?? "1.0"}"`);

  if (prompt.tags?.length) {
    lines.push("tags:");
    for (const tag of prompt.tags) lines.push(`  - ${tag}`);
  }

  if (prompt.variables?.length) {
    lines.push("variables:");
    for (const v of prompt.variables) {
      lines.push(`  - name: ${v.name}`);
      lines.push(`    description: "${v.description}"`);
      if (v.default) lines.push(`    default: "${v.default}"`);
    }
  }

  if (prompt.links?.length) {
    lines.push("links:");
    for (const l of prompt.links) {
      lines.push(`  - label: "${l.label}"`);
      lines.push(`    url: "${l.url}"`);
    }
  }

  lines.push("---");
  lines.push("");
  lines.push(prompt.content);
  lines.push("");
  return lines.join("\n");
}
