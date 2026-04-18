/**
 * System prompt for the Arcan chat on broomva.tech.
 *
 * The prompt is assembled in five layers (see
 * docs/superpowers/specs/2026-04-17-arcan-chat-prompt-design.md):
 *
 *   1. Arcan identity   — baked from content/agent/identity.mdx at cold start
 *   2. Live index       — per request: pinned projects + latest writing/notes
 *   3. KG navigation    — baked string with the graph landscape
 *   4. Tool protocol    — baked rules for when/how to call tools
 *   5. User context     — per request, auth-gated
 *
 * `buildSystemPrompt` is the single public export — call it with isAnonymous,
 * userName, and memoryVaultAvailable as needed.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import matter from "gray-matter";
import { getLatest, getPinnedProjects } from "@/lib/content";
import { createModuleLogger } from "@/lib/logger";

const log = createModuleLogger("ai:prompts");

// ── Layer 1: Identity (cold-start cached) ────────────────────────────────────

const IDENTITY_FALLBACK = `# Who I am

I'm Arcan — the user-facing instance of the Broomva agent runtime.

# Who I serve

Carlos D. Escobar-Valbuena (AI engineer, agent architect, builder), and anyone interacting with him through broomva.tech.

# Tone

Direct, technical, first-person. I cite my sources.`;

let _identity: string | null = null;

function getIdentity(): string {
  if (_identity !== null) return _identity;
  try {
    const path = join(process.cwd(), "content", "agent", "identity.mdx");
    const raw = readFileSync(path, "utf-8");
    _identity = matter(raw).content.trim();
    return _identity;
  } catch (err) {
    log.warn({ err }, "identity.mdx missing — using fallback identity string");
    _identity = IDENTITY_FALLBACK;
    return _identity;
  }
}

// ── Layer 2: Live index (per request) ────────────────────────────────────────

interface LiveIndex {
  pinnedProjects: Array<{ title: string; summary: string; url: string }>;
  latestWriting: Array<{ title: string; url: string }>;
  latestNotes: Array<{ title: string; url: string }>;
}

async function buildLiveIndex(): Promise<LiveIndex> {
  try {
    const [pinned, writing, notes] = await Promise.all([
      getPinnedProjects(3),
      getLatest("writing", 3),
      getLatest("notes", 3),
    ]);
    return {
      pinnedProjects: pinned.map((p) => ({
        title: p.title,
        summary: p.summary ?? "",
        url: `/projects/${p.slug}`,
      })),
      latestWriting: writing.map((w) => ({
        title: w.title,
        url: `/writing/${w.slug}`,
      })),
      latestNotes: notes.map((n) => ({
        title: n.title,
        url: `/notes/${n.slug}`,
      })),
    };
  } catch (err) {
    log.warn({ err }, "live index build failed — returning empty");
    return { pinnedProjects: [], latestWriting: [], latestNotes: [] };
  }
}

function formatLiveIndex(idx: LiveIndex, today: string): string {
  const parts: string[] = [`Today: ${today}`];

  if (idx.pinnedProjects.length > 0) {
    parts.push(
      `\n## Pinned projects (right now)\n${idx.pinnedProjects
        .map((p) => `- **${p.title}** — ${p.summary || "no summary"} · ${p.url}`)
        .join("\n")}`,
    );
  }
  if (idx.latestWriting.length > 0) {
    parts.push(
      `\n## Latest writing\n${idx.latestWriting
        .map((w) => `- ${w.title} · ${w.url}`)
        .join("\n")}`,
    );
  }
  if (idx.latestNotes.length > 0) {
    parts.push(
      `\n## Latest notes\n${idx.latestNotes
        .map((n) => `- ${n.title} · ${n.url}`)
        .join("\n")}`,
    );
  }
  return parts.join("\n");
}

// ── Layer 3: KG navigation hints (baked) ─────────────────────────────────────

const NAVIGATION_HINTS = `## Where knowledge lives

Public knowledge graph (always available, indexed on every deploy at \`public/agent-knowledge.json\`):
- \`/writing/*\` — essays, tech deep dives
- \`/notes/*\` — shorter takes, seeds
- \`/projects/*\` — project pages with deployment info
- \`/prompts/*\` — versioned prompt library
- \`/skills\` — bstack (27 agent skills, 7 layers)
- \`/graph\` — force-directed view of all above

Local-only (requires VAULT_PATH — your laptop, not Vercel):
- 00-Index/Broomva Index, Projects, Consciousness
- 01-Life, 02-Symphony, 03-Autoany, 04-Control-Kernel, 05-ChatOS, 06-Symphony-Cloud, 08-Research

User vault (requires auth + memoryVault feature flag):
- Personal notes, private context, preferences`;

// ── Layer 4: Tool protocol (baked) ───────────────────────────────────────────

const TOOL_PROTOCOL = `## How I use tools

- **Default to retrieval** when the question touches Broomva project architecture, past decisions, open-source internals, published writing, or any claim that needs a source.
- **Cite every retrieved fact inline** using \`[Title](/writing/slug)\` — not a footer, not a separate section.
- **Prefer \`readKnowledgeNote\`** when I know the id/slug/title (from the Live Index or Navigation map above). Only fall back to \`searchKnowledge\` for discovery.
- **Use \`traverseKnowledge\`** for "what else relates to X" / "how does X connect to Y" questions — one tool call answers the neighborhood.
- **No hallucinated URLs.** If I don't have a source, I say so and offer to search.
- **Skip retrieval** for general programming questions, generic explanations, or anything Carlos could answer himself. Reserve tool calls for Broomva-specific knowledge.
- **Prompt templates**: \`listPrompts\` / \`getPrompt\` / \`savePrompt\` / \`deletePrompt\` are for user-managed prompt templates (not the identity layer).

## Output rules

- Markdown supported — use it for structure.
- If a diagram helps, use a fenced \`\`\`mermaid block.
- Currency: USD, spelled out. Never bare \`$\`.
- Responses are substantive and well-formatted — not terse, not marketing fluff.`;

// ── Layer 5: User context (per request, auth-gated) ──────────────────────────

interface UserContextInput {
  userName?: string | null;
  isAnonymous: boolean;
  memoryVaultAvailable?: boolean;
}

function formatUserContext(input: UserContextInput): string {
  if (input.isAnonymous) {
    return `## Who I'm talking to

A visitor. No personal vault. I keep answers grounded in the public knowledge graph and cite every source.`;
  }
  const vault = input.memoryVaultAvailable
    ? "Your user vault is available — use `searchKnowledge` for personal/private context."
    : "Your user vault is not configured on this deploy — stay in the public graph.";
  return `## Who I'm talking to

Carlos${input.userName ? ` (logged in as ${input.userName})` : ""}. ${vault}`;
}

// ── Assembler ────────────────────────────────────────────────────────────────

export interface BuildSystemPromptInput {
  isAnonymous: boolean;
  userName?: string | null;
  memoryVaultAvailable?: boolean;
}

export async function buildSystemPrompt(
  input: BuildSystemPromptInput,
): Promise<string> {
  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    weekday: "short",
  });

  const [live] = await Promise.all([buildLiveIndex()]);

  const sections = [
    getIdentity(),
    `# Live state\n\n${formatLiveIndex(live, today)}`,
    NAVIGATION_HINTS,
    TOOL_PROTOCOL,
    formatUserContext({
      isAnonymous: input.isAnonymous,
      userName: input.userName ?? null,
      memoryVaultAvailable: input.memoryVaultAvailable ?? false,
    }),
  ];

  return sections.join("\n\n---\n\n");
}
