# Arcan Chat — Prompt + Knowledge Graph Grounding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the broomva.tech `/chat` and landing agent into the in-repo knowledge graph. Replace the one-line "friendly assistant" prompt with a 5-layer Arcan system prompt, ship a build-time `public/agent-knowledge.json` containing all MDX content + wikilink graph, and teach `searchKnowledge` / `readKnowledgeNote` / new `traverseKnowledge` tools to read it.

**Architecture:** Prebuild script re-walks `apps/chat/content/**/*.mdx` and reuses `lib/graph/build-public.ts` logic to emit a single rich JSON. A runtime loader caches it per cold start. Existing tool factories gain a body-aware `site-content` source; a new factory `traverseKnowledgeTool` follows wikilink/tag/related edges. The system prompt is reassembled per request from a hand-authored identity MDX, live content indexes (pinned projects, latest writing/notes), navigation hints, tool protocol, and a session-gated user context.

**Tech Stack:** Next.js 16, TypeScript, Bun (build), Vitest (unit tests), evalite (evals), `ai` SDK v6, `gray-matter`, existing `@/lib/content.ts` helpers, existing `@/lib/ai/vault/*` backends.

**Spec:** `docs/superpowers/specs/2026-04-17-arcan-chat-prompt-design.md`

**Working directory:** `/Users/broomva/broomva/broomva.tech/apps/chat/` (paths in this plan are relative to this directory unless stated absolute).

**Commit style:** Project uses Conventional Commits. Each task ends with one commit. Co-author lines are auto-added by the working harness — do not add them manually.

---

## Task 1 — Hand-authored Arcan identity MDX

**Files:**
- Create: `content/agent/identity.mdx`

- [ ] **Step 1: Create the `agent` content directory**

```bash
mkdir -p content/agent
```

- [ ] **Step 2: Write `content/agent/identity.mdx`**

```mdx
---
title: Arcan Identity
kind: agent-identity
published: false
version: 1
---

# Who I am

I'm **Arcan** — the user-facing instance of the Broomva agent runtime. I live on broomva.tech and speak with first-person authority on Broomva's open-source stack. I'm not a generic assistant; I'm the face of a specific system Carlos is building in public.

# Who I serve

My primary user is **Carlos D. Escobar-Valbuena** — AI engineer, agent architect, builder. Colombian, based in Bogotá, open-source-first, writes about agent systems at broomva.tech/writing. Anyone interacting with me through this site is either Carlos working, or a visitor (recruiter, collaborator, engineer) trying to understand what Carlos is building. I treat both with the same depth: the knowledge is open by design.

# What Broomva is

Broomva is a unified **Agent Operating System** built as open source. The top-level pieces:

- **Life** — the Rust monorepo (`core/life`) implementing the Agent OS kernel: **Arcan** (agent runtime daemon), **Lago** (event-sourced persistence, append-only redb v2 journal), **Vigil** (OpenTelemetry-native observability), **Praxis** (tool execution sandbox), **Haima** (agentic finance engine, x402 machine-to-machine payments), **Spaces** (SpacetimeDB 2.0 distributed agent networking), **Anima** (soul/self layer), **Autonomic** (homeostasis controller), **aiOS** (kernel contract — Rust types, event taxonomy, trait interfaces).
- **Symphony** — Rust orchestration engine for coding agents (`core/symphony`).
- **ChatOS** — the app you're talking to right now (`apps/chat` in the broomva.tech monorepo). Turborepo + Next.js 16 + AI SDK v6.
- **Control Kernel** — the governance metalayer (`core/agentic-control-kernel`) that wraps any repo with CLAUDE.md / AGENTS.md / METALAYER.md / `.control/policy.yaml`.
- **bstack** — 27 curated agent skills across 7 layers, the Broomva Stack CLI.

# Core bets

- **Agent-native architecture**: systems designed around agents as first-class operators, not bolted onto human UIs.
- **Event-sourced state**: Lago as an append-only journal; everything is reconstructible from events.
- **Control-systems metalayer**: governance as a typed control system with stability margins, not a pile of YAML rules.
- **Open-source substrate**: the stack is MIT/Apache. Monetization is trust/liquidity/network/state/liability — not the code.
- **Progressive crystallization of knowledge**: Layer 1 (ephemeral) → Layer 2 (raw extracts) → Layer 3 (entity pages) → Layer 4 (synthesis). Scored through the Nous gate (≥5/9).

# Conventions

- **Rust** for the Agent OS stack (Life, Symphony, Arcan daemon).
- **TypeScript** for web apps. **Bun** as package manager and runtime for scripts. **Biome** for linting/formatting — never ESLint/Prettier. **Better Auth** for auth, not NextAuth. **Drizzle** for ORM. **Turborepo** for the monorepo.
- **Currency**: USD. Never `$`; always "USD".

# Tone

Direct. Technical. First-person as Arcan — not as a disembodied assistant. I cite my sources inline. I show architectural thinking. I don't use marketing copy. I don't hallucinate URLs — if I'm not sure, I search or say so.

# What I can do here

- Answer any question about writing, notes, projects, prompts, and skills published on broomva.tech.
- Traverse the public knowledge graph (wikilinks, tags, related frontmatter) to answer "what connects to X" questions.
- (If you're logged in and your memory vault is configured) pull from your personal Lago notes.
- Draft, plan, explain code — same as any strong engineering assistant — but ground in Broomva knowledge when the question touches the stack.
```

- [ ] **Step 3: Commit**

```bash
git add content/agent/identity.mdx
git commit -m "feat(chat): add Arcan identity MDX for system prompt layer 1"
```

---

## Task 2 — Agent knowledge types

**Files:**
- Create: `lib/ai/knowledge/types.ts`

- [ ] **Step 1: Create the `knowledge` directory**

```bash
mkdir -p lib/ai/knowledge
```

- [ ] **Step 2: Write `lib/ai/knowledge/types.ts`**

```ts
/**
 * Shared types for the agent knowledge graph.
 *
 * The build-time `generate-agent-knowledge.ts` script emits a single
 * JSON blob at `public/agent-knowledge.json` that matches this shape.
 * The runtime loader in `site-content.ts` reads and caches it.
 */

export type ContentKind = "notes" | "projects" | "writing" | "prompts";

export interface AgentDocument {
  /** Stable id: `"{kind}/{slug}"` — also used as graph node id. */
  id: string;
  kind: ContentKind;
  slug: string;
  title: string;
  summary: string;
  /** Site URL path, e.g. `/writing/agent-native-architecture`. */
  url: string;
  tags: string[];
  frontmatter: Record<string, unknown>;
  /** MDX body with JSX stripped to plain text. */
  body: string;
  /** Normalized wikilink targets (slug-form). */
  wikilinks: string[];
  /** Frontmatter `related:` slugs, normalized. */
  related: string[];
  headings: Array<{ depth: number; text: string }>;
  wordCount: number;
}

export type GraphNodeType =
  | ContentKind
  | "tag"
  | "skill";

export interface AgentGraphNode {
  id: string;
  label: string;
  type: GraphNodeType;
  url?: string;
  summary?: string;
  tags: string[];
  val: number;
}

export type AgentGraphEdgeType = "wikilink" | "reference" | "tag";

export interface AgentGraphEdge {
  source: string;
  target: string;
  type: AgentGraphEdgeType;
}

export interface AgentKnowledge {
  generatedAt: string;
  commit: string;
  documents: AgentDocument[];
  graph: {
    nodes: AgentGraphNode[];
    links: AgentGraphEdge[];
  };
  /** term → array of document ids; lowercased terms. */
  invertedIndex: Record<string, string[]>;
}
```

- [ ] **Step 3: Verify it compiles**

Run: `bun test:types`
Expected: no type errors related to `lib/ai/knowledge/types.ts`.

- [ ] **Step 4: Commit**

```bash
git add lib/ai/knowledge/types.ts
git commit -m "feat(chat): add AgentKnowledge types for KG loader"
```

---

## Task 3 — Build script: `generate-agent-knowledge.ts`

**Files:**
- Create: `scripts/generate-agent-knowledge.ts`
- Modify: `package.json`

- [ ] **Step 1: Write `scripts/generate-agent-knowledge.ts`**

```ts
/**
 * Build-time script: emits public/agent-knowledge.json for the Arcan chat.
 *
 * Sources: every MDX under content/{writing,notes,projects,prompts}.
 * For each document it captures: body (JSX stripped), frontmatter, tags,
 * wikilinks, related, headings, wordCount — plus a graph view (nodes + edges)
 * and an inverted term index.
 *
 * Usage:  bun scripts/generate-agent-knowledge.ts
 * Wired:  prebuild hook + vercel.json buildCommand.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { execSync } from "node:child_process";
import matter from "gray-matter";
import type {
  AgentDocument,
  AgentGraphEdge,
  AgentGraphEdgeType,
  AgentGraphNode,
  AgentKnowledge,
  ContentKind,
} from "../lib/ai/knowledge/types";

const CONTENT_ROOT = path.join(process.cwd(), "content");
const KINDS: ContentKind[] = ["writing", "notes", "projects", "prompts"];
const KIND_ROUTES: Record<ContentKind, string> = {
  writing: "/writing",
  notes: "/notes",
  projects: "/projects",
  prompts: "/prompts",
};

// ── Wikilink + heading extraction ────────────────────────────────────────────

function extractWikilinks(markdown: string): string[] {
  const matches = [...markdown.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)];
  return matches.map((m) => m[1].trim().toLowerCase().replace(/\s+/g, "-"));
}

function extractHeadings(markdown: string): Array<{ depth: number; text: string }> {
  const lines = markdown.split("\n");
  const headings: Array<{ depth: number; text: string }> = [];
  for (const line of lines) {
    const m = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (m) headings.push({ depth: m[1].length, text: m[2] });
  }
  return headings;
}

/** Strip MDX JSX to plain text; keep markdown prose. */
function stripJsx(md: string): string {
  return md
    // Strip JSX import/export lines
    .replace(/^(import|export)\s[^\n]*$/gm, "")
    // Strip self-closing JSX tags: <Foo bar="x" />
    .replace(/<[A-Z][\w.]*[^>]*\/>/g, "")
    // Strip paired JSX: <Foo>...</Foo>
    .replace(/<([A-Z][\w.]*)[^>]*>[\s\S]*?<\/\1>/g, "")
    // Collapse excess blank lines
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function wordCount(text: string): number {
  const words = text.replace(/[^\p{L}\p{N}\s]/gu, " ").trim().split(/\s+/);
  return words.filter(Boolean).length;
}

// ── Per-kind reader ──────────────────────────────────────────────────────────

async function readKind(kind: ContentKind): Promise<AgentDocument[]> {
  const dir = path.join(CONTENT_ROOT, kind);
  let files: string[];
  try {
    files = await fs.readdir(dir);
  } catch {
    return [];
  }

  const docs: AgentDocument[] = [];
  for (const file of files) {
    if (!/\.(md|mdx)$/.test(file)) continue;
    const slug = file.replace(/\.(md|mdx)$/, "");
    const raw = await fs.readFile(path.join(dir, file), "utf8");
    const parsed = matter(raw);
    if (parsed.data.published === false) continue;

    const tags: string[] = Array.isArray(parsed.data.tags)
      ? parsed.data.tags.filter((t: unknown): t is string => typeof t === "string")
      : [];
    const related: string[] = Array.isArray(parsed.data.related)
      ? parsed.data.related
          .filter((r: unknown): r is string => typeof r === "string")
          .map((r) =>
            r.replace(/^\[\[|\]\]$/g, "").trim().toLowerCase().replace(/\s+/g, "-"),
          )
      : [];

    const body = stripJsx(parsed.content);

    docs.push({
      id: `${kind}/${slug}`,
      kind,
      slug,
      title: typeof parsed.data.title === "string" ? parsed.data.title : slug,
      summary: typeof parsed.data.summary === "string" ? parsed.data.summary : "",
      url: `${KIND_ROUTES[kind]}/${slug}`,
      tags,
      frontmatter: parsed.data,
      body,
      wikilinks: extractWikilinks(parsed.content),
      related,
      headings: extractHeadings(parsed.content),
      wordCount: wordCount(body),
    });
  }
  return docs;
}

// ── Graph builder ────────────────────────────────────────────────────────────

function buildGraph(docs: AgentDocument[]): { nodes: AgentGraphNode[]; links: AgentGraphEdge[] } {
  const nodes: AgentGraphNode[] = [];
  const links: AgentGraphEdge[] = [];
  const slugToId = new Map<string, string>();
  const tagUsage = new Map<string, number>();

  for (const doc of docs) {
    slugToId.set(doc.slug, doc.id);
    slugToId.set(doc.title.toLowerCase().replace(/\s+/g, "-"), doc.id);
    slugToId.set(doc.title.toLowerCase(), doc.id);

    nodes.push({
      id: doc.id,
      label: doc.title,
      type: doc.kind,
      url: doc.url,
      summary: doc.summary,
      tags: doc.tags,
      val: 1,
    });

    for (const tag of doc.tags) tagUsage.set(tag, (tagUsage.get(tag) ?? 0) + 1);
  }

  for (const [tag, count] of tagUsage) {
    nodes.push({ id: `tag:${tag}`, label: tag, type: "tag", tags: [], val: count });
  }

  const seen = new Set<string>();
  const addEdge = (source: string, target: string, type: AgentGraphEdgeType) => {
    const key = [source, target, type].sort().join("|");
    if (seen.has(key)) return;
    seen.add(key);
    links.push({ source, target, type });
  };

  for (const doc of docs) {
    for (const tag of doc.tags) addEdge(doc.id, `tag:${tag}`, "tag");
    for (const wl of doc.wikilinks) {
      const target = slugToId.get(wl);
      if (target && target !== doc.id) addEdge(doc.id, target, "wikilink");
    }
    for (const rel of doc.related) {
      const target = slugToId.get(rel);
      if (target && target !== doc.id) addEdge(doc.id, target, "reference");
    }
  }

  // Degree-weight node sizes
  const degree = new Map<string, number>();
  for (const l of links) {
    degree.set(l.source, (degree.get(l.source) ?? 0) + 1);
    degree.set(l.target, (degree.get(l.target) ?? 0) + 1);
  }
  for (const n of nodes) n.val = Math.max(1, degree.get(n.id) ?? 1);

  return { nodes, links };
}

// ── Inverted index ───────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  "the","a","an","and","or","but","of","to","in","on","at","for","is","are",
  "was","were","be","been","being","this","that","these","those","it","its",
  "i","you","he","she","we","they","as","by","with","from","up","about",
  "into","over","after","not","no","so","if","then","than","can","will","would",
  "should","could","may","might","must","do","does","did","have","has","had",
]);

function buildInvertedIndex(docs: AgentDocument[]): Record<string, string[]> {
  const index: Record<string, Set<string>> = {};
  for (const doc of docs) {
    const haystack = `${doc.title} ${doc.summary} ${doc.body} ${doc.tags.join(" ")}`.toLowerCase();
    const terms = haystack.match(/[\p{L}\p{N}]{3,}/gu) ?? [];
    for (const term of terms) {
      if (STOP_WORDS.has(term)) continue;
      if (!index[term]) index[term] = new Set();
      index[term].add(doc.id);
    }
  }
  const out: Record<string, string[]> = {};
  for (const [term, set] of Object.entries(index)) out[term] = [...set];
  return out;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("Generating agent knowledge index…");

  const docsByKind = await Promise.all(KINDS.map(readKind));
  const docs = docsByKind.flat();

  const graph = buildGraph(docs);
  const invertedIndex = buildInvertedIndex(docs);

  let commit = "unknown";
  try {
    commit = execSync("git rev-parse HEAD", { cwd: process.cwd() }).toString().trim();
  } catch {
    // not a git checkout — keep "unknown"
  }

  const knowledge: AgentKnowledge = {
    generatedAt: new Date().toISOString(),
    commit,
    documents: docs,
    graph,
    invertedIndex,
  };

  const outPath = path.join(process.cwd(), "public", "agent-knowledge.json");
  const json = JSON.stringify(knowledge);
  await fs.writeFile(outPath, json, "utf8");

  const bytes = Buffer.byteLength(json, "utf8");
  console.log(
    `  ✓ ${docs.length} documents, ${graph.nodes.length} graph nodes, ${graph.links.length} edges, ${Object.keys(invertedIndex).length} index terms (${(bytes / 1024).toFixed(1)} KB) → public/agent-knowledge.json`,
  );
}

main().catch((err) => {
  console.error("Agent knowledge generation failed:", err);
  process.exit(1);
});
```

- [ ] **Step 2: Wire into `package.json`**

Edit `package.json`. Change the `prebuild` and add a new script entry. The current prebuild is at line 7.

Replace:
```json
"prebuild": "bun run generate:search-index && bun run check-env",
"generate:search-index": "bun scripts/generate-search-index.ts",
```
With:
```json
"prebuild": "bun run generate:search-index && bun run generate:agent-knowledge && bun run check-env",
"generate:search-index": "bun scripts/generate-search-index.ts",
"generate:agent-knowledge": "bun scripts/generate-agent-knowledge.ts",
```

- [ ] **Step 3: Run the script and verify the JSON lands**

Run: `bun run generate:agent-knowledge`
Expected output line: `✓ N documents, M graph nodes, K edges, T index terms (… KB) → public/agent-knowledge.json`

Then:
```bash
ls -la public/agent-knowledge.json
```
Expected: file exists, size > 100 KB.

Run: `node -e 'const k = require("./public/agent-knowledge.json"); console.log({docs: k.documents.length, nodes: k.graph.nodes.length, edges: k.graph.links.length, terms: Object.keys(k.invertedIndex).length, commit: k.commit.slice(0,8)})'`
Expected: non-zero counts for all four, 8-char commit hash (or `"unknown"` if running in CI without git — acceptable).

- [ ] **Step 4: Add `public/agent-knowledge.json` to `.gitignore`**

Check: `grep agent-knowledge .gitignore`
If not present, append:
```bash
echo "public/agent-knowledge.json" >> .gitignore
```

Rationale: it's a build artifact regenerated on every deploy. Treat it like `public/search-index.json`.

Verify: `grep search-index .gitignore` — confirm the existing search-index is also in `.gitignore` so we mirror the existing pattern. If it isn't, skip this step (let git track both; don't silently diverge).

- [ ] **Step 5: Commit**

```bash
git add scripts/generate-agent-knowledge.ts package.json
git add .gitignore 2>/dev/null || true
git commit -m "feat(chat): add agent-knowledge build script + prebuild wiring"
```

---

## Task 4 — Ship the JSON with the serverless function

**Files:**
- Modify: `next.config.ts`

- [ ] **Step 1: Read the current config tracing block**

Run:
```bash
grep -n outputFileTracing next.config.ts
```
Expected: shows `outputFileTracingExcludes` block starting at line ~79.

- [ ] **Step 2: Add `outputFileTracingIncludes` next to the existing excludes**

Edit `next.config.ts`. Find:
```ts
  outputFileTracingExcludes: {
    "*": [
      "./public/audio/**",
      "./public/images/**",
    ],
  },
```

Add immediately after it (before `experimental:`):
```ts
  outputFileTracingIncludes: {
    "/api/chat": ["./public/agent-knowledge.json"],
    "/api/chat/[id]/**": ["./public/agent-knowledge.json"],
  },
```

- [ ] **Step 3: Verify the config still type-checks**

Run: `bun test:types 2>&1 | head -40`
Expected: no errors in `next.config.ts`. (Unrelated existing errors elsewhere are fine.)

- [ ] **Step 4: Commit**

```bash
git add next.config.ts
git commit -m "feat(chat): include agent-knowledge.json in chat route tracing"
```

---

## Task 5 — Runtime loader + search + read + traverse

**Files:**
- Create: `lib/ai/knowledge/site-content.ts`
- Create: `lib/ai/knowledge/site-content.test.ts`
- Create: `lib/ai/knowledge/__fixtures__/agent-knowledge.fixture.json`

- [ ] **Step 1: Write the fixture JSON**

```bash
mkdir -p lib/ai/knowledge/__fixtures__
```

Create `lib/ai/knowledge/__fixtures__/agent-knowledge.fixture.json`:

```json
{
  "generatedAt": "2026-04-17T00:00:00.000Z",
  "commit": "abc1234",
  "documents": [
    {
      "id": "writing/agent-native-architecture",
      "kind": "writing",
      "slug": "agent-native-architecture",
      "title": "Agent-Native Architecture",
      "summary": "Systems designed for agents, not humans.",
      "url": "/writing/agent-native-architecture",
      "tags": ["agent-os", "architecture"],
      "frontmatter": { "title": "Agent-Native Architecture", "tags": ["agent-os", "architecture"] },
      "body": "Agent-native architecture means building control planes where the primary operator is an agent. See [[life-agent-os]] for the reference implementation.",
      "wikilinks": ["life-agent-os"],
      "related": [],
      "headings": [{ "depth": 1, "text": "Agent-Native Architecture" }],
      "wordCount": 22
    },
    {
      "id": "projects/life-agent-os",
      "kind": "projects",
      "slug": "life-agent-os",
      "title": "Life Agent OS",
      "summary": "The unified Rust monorepo for the Broomva Agent OS.",
      "url": "/projects/life-agent-os",
      "tags": ["agent-os", "rust"],
      "frontmatter": { "title": "Life Agent OS", "pinned": true },
      "body": "Life is the Rust monorepo implementing Arcan, Lago, Vigil, Praxis, Haima, Spaces, Anima, Autonomic, and aiOS.",
      "wikilinks": [],
      "related": ["agent-native-architecture"],
      "headings": [{ "depth": 1, "text": "Life Agent OS" }],
      "wordCount": 18
    }
  ],
  "graph": {
    "nodes": [
      { "id": "writing/agent-native-architecture", "label": "Agent-Native Architecture", "type": "writing", "url": "/writing/agent-native-architecture", "summary": "Systems designed for agents, not humans.", "tags": ["agent-os", "architecture"], "val": 3 },
      { "id": "projects/life-agent-os", "label": "Life Agent OS", "type": "projects", "url": "/projects/life-agent-os", "summary": "The unified Rust monorepo for the Broomva Agent OS.", "tags": ["agent-os", "rust"], "val": 3 },
      { "id": "tag:agent-os", "label": "agent-os", "type": "tag", "tags": [], "val": 2 },
      { "id": "tag:architecture", "label": "architecture", "type": "tag", "tags": [], "val": 1 },
      { "id": "tag:rust", "label": "rust", "type": "tag", "tags": [], "val": 1 }
    ],
    "links": [
      { "source": "writing/agent-native-architecture", "target": "projects/life-agent-os", "type": "wikilink" },
      { "source": "writing/agent-native-architecture", "target": "tag:agent-os", "type": "tag" },
      { "source": "writing/agent-native-architecture", "target": "tag:architecture", "type": "tag" },
      { "source": "projects/life-agent-os", "target": "writing/agent-native-architecture", "type": "reference" },
      { "source": "projects/life-agent-os", "target": "tag:agent-os", "type": "tag" },
      { "source": "projects/life-agent-os", "target": "tag:rust", "type": "tag" }
    ]
  },
  "invertedIndex": {
    "agent": ["writing/agent-native-architecture", "projects/life-agent-os"],
    "native": ["writing/agent-native-architecture"],
    "architecture": ["writing/agent-native-architecture"],
    "life": ["projects/life-agent-os"],
    "rust": ["projects/life-agent-os"]
  }
}
```

- [ ] **Step 2: Write the failing tests first** (`lib/ai/knowledge/site-content.test.ts`)

```ts
import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import {
  __setKnowledgeSourceForTests,
  loadAgentKnowledge,
  searchSiteContent,
  readSiteNote,
  traverseFrom,
  resetKnowledgeCacheForTests,
} from "./site-content";

const FIXTURE = path.join(
  __dirname,
  "__fixtures__",
  "agent-knowledge.fixture.json",
);

describe("site-content loader", () => {
  beforeEach(() => {
    resetKnowledgeCacheForTests();
    __setKnowledgeSourceForTests(FIXTURE);
  });

  it("loads and caches the knowledge JSON", async () => {
    const k1 = await loadAgentKnowledge();
    const k2 = await loadAgentKnowledge();
    expect(k1).toBe(k2); // identity: cache hit
    expect(k1.documents.length).toBe(2);
    expect(k1.graph.nodes.length).toBe(5);
  });

  it("returns empty knowledge when the file is missing", async () => {
    __setKnowledgeSourceForTests("/tmp/definitely-not-here.json");
    resetKnowledgeCacheForTests();
    const k = await loadAgentKnowledge();
    expect(k.documents).toEqual([]);
    expect(k.graph.nodes).toEqual([]);
  });
});

describe("searchSiteContent", () => {
  beforeEach(() => {
    resetKnowledgeCacheForTests();
    __setKnowledgeSourceForTests(FIXTURE);
  });

  it("returns docs matching a single term via inverted index", async () => {
    const results = await searchSiteContent("architecture", { maxResults: 5 });
    expect(results.length).toBe(1);
    expect(results[0].id).toBe("writing/agent-native-architecture");
  });

  it("ranks title matches above body-only matches", async () => {
    const results = await searchSiteContent("agent", { maxResults: 5 });
    // Both docs contain "agent"; "Agent-Native Architecture" has it in the title
    // so it should outrank "Life Agent OS" which has "Agent" in the middle.
    expect(results[0].id).toBe("writing/agent-native-architecture");
  });

  it("returns empty when no terms match", async () => {
    const results = await searchSiteContent("kubernetes", { maxResults: 5 });
    expect(results).toEqual([]);
  });

  it("respects maxResults", async () => {
    const results = await searchSiteContent("agent", { maxResults: 1 });
    expect(results.length).toBe(1);
  });
});

describe("readSiteNote", () => {
  beforeEach(() => {
    resetKnowledgeCacheForTests();
    __setKnowledgeSourceForTests(FIXTURE);
  });

  it("resolves by id", async () => {
    const note = await readSiteNote("writing/agent-native-architecture");
    expect(note?.title).toBe("Agent-Native Architecture");
  });

  it("resolves by slug", async () => {
    const note = await readSiteNote("agent-native-architecture");
    expect(note?.id).toBe("writing/agent-native-architecture");
  });

  it("resolves by title (case-insensitive)", async () => {
    const note = await readSiteNote("Life Agent OS");
    expect(note?.id).toBe("projects/life-agent-os");
  });

  it("returns null for unknown note", async () => {
    const note = await readSiteNote("nonexistent");
    expect(note).toBeNull();
  });
});

describe("traverseFrom", () => {
  beforeEach(() => {
    resetKnowledgeCacheForTests();
    __setKnowledgeSourceForTests(FIXTURE);
  });

  it("returns 1-hop neighbors via wikilinks", async () => {
    const { seed, neighbors } = await traverseFrom(
      "writing/agent-native-architecture",
      { edgeTypes: ["wikilink"], depth: 1, maxNeighbors: 10 },
    );
    expect(seed?.id).toBe("writing/agent-native-architecture");
    expect(neighbors.map((n) => n.node.id)).toContain("projects/life-agent-os");
  });

  it("filters by edge type", async () => {
    const { neighbors } = await traverseFrom("writing/agent-native-architecture", {
      edgeTypes: ["reference"],
      depth: 1,
      maxNeighbors: 10,
    });
    expect(neighbors.map((n) => n.node.id)).not.toContain("projects/life-agent-os");
  });

  it("includes tag neighbors when tag edge type requested", async () => {
    const { neighbors } = await traverseFrom("writing/agent-native-architecture", {
      edgeTypes: ["tag"],
      depth: 1,
      maxNeighbors: 10,
    });
    const ids = neighbors.map((n) => n.node.id);
    expect(ids).toContain("tag:agent-os");
    expect(ids).toContain("tag:architecture");
  });

  it("traverses 2 hops", async () => {
    const { neighbors } = await traverseFrom("tag:agent-os", {
      edgeTypes: ["tag", "wikilink"],
      depth: 2,
      maxNeighbors: 20,
    });
    const ids = neighbors.map((n) => n.node.id);
    expect(ids).toContain("writing/agent-native-architecture");
    expect(ids).toContain("projects/life-agent-os");
  });

  it("returns null seed for unknown node", async () => {
    const { seed, neighbors } = await traverseFrom("nope", {
      edgeTypes: ["wikilink"],
      depth: 1,
      maxNeighbors: 10,
    });
    expect(seed).toBeNull();
    expect(neighbors).toEqual([]);
  });
});
```

- [ ] **Step 3: Run tests to confirm they fail**

Run: `bunx vitest run lib/ai/knowledge/site-content.test.ts`
Expected: FAIL — `site-content.ts` does not exist.

- [ ] **Step 4: Write `lib/ai/knowledge/site-content.ts`**

```ts
/**
 * Runtime loader + query helpers for the agent knowledge JSON.
 *
 * The JSON is generated at build time by scripts/generate-agent-knowledge.ts
 * and lives at public/agent-knowledge.json. It is cached in-module after the
 * first load.
 *
 * Graceful degradation: if the file is missing or unparseable, this module
 * returns an empty knowledge object and logs once. The tools that depend on
 * it will return `{ error: "..." }` so the model gets a clean signal.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { createModuleLogger } from "@/lib/logger";
import type {
  AgentDocument,
  AgentGraphEdgeType,
  AgentGraphNode,
  AgentKnowledge,
} from "./types";

const log = createModuleLogger("ai:knowledge:site-content");

const EMPTY_KNOWLEDGE: AgentKnowledge = {
  generatedAt: "1970-01-01T00:00:00.000Z",
  commit: "unknown",
  documents: [],
  graph: { nodes: [], links: [] },
  invertedIndex: {},
};

let _cache: AgentKnowledge | null = null;
let _warned = false;

let _sourcePath: string | null = null;

function defaultSourcePath(): string {
  return path.join(process.cwd(), "public", "agent-knowledge.json");
}

/** Test-only: override the JSON path for fixture-based unit tests. */
export function __setKnowledgeSourceForTests(p: string): void {
  _sourcePath = p;
}

/** Test-only: clear the in-module cache. */
export function resetKnowledgeCacheForTests(): void {
  _cache = null;
  _warned = false;
}

// ── Loader ───────────────────────────────────────────────────────────────────

export async function loadAgentKnowledge(): Promise<AgentKnowledge> {
  if (_cache) return _cache;

  const source = _sourcePath ?? defaultSourcePath();
  try {
    const raw = await fs.readFile(source, "utf8");
    _cache = JSON.parse(raw) as AgentKnowledge;
    return _cache;
  } catch (err) {
    if (!_warned) {
      log.warn(
        { err, source },
        "agent-knowledge.json missing or unparseable — falling back to empty knowledge",
      );
      _warned = true;
    }
    _cache = EMPTY_KNOWLEDGE;
    return _cache;
  }
}

// ── Search ───────────────────────────────────────────────────────────────────

export interface SiteSearchResult {
  id: string;
  title: string;
  slug: string;
  kind: AgentDocument["kind"];
  url: string;
  summary: string;
  tags: string[];
  excerpts: string[];
  wikilinks: string[];
  score: number;
}

export interface SearchOptions {
  maxResults?: number;
}

/** Build an excerpt around the first match of any query term. */
function excerpt(body: string, terms: string[], radius = 140): string {
  if (!body) return "";
  const lower = body.toLowerCase();
  let bestPos = -1;
  for (const term of terms) {
    const pos = lower.indexOf(term);
    if (pos !== -1 && (bestPos === -1 || pos < bestPos)) bestPos = pos;
  }
  if (bestPos === -1) return body.slice(0, radius * 2);
  const start = Math.max(0, bestPos - radius);
  const end = Math.min(body.length, bestPos + radius);
  return `${start > 0 ? "… " : ""}${body.slice(start, end).replace(/\s+/g, " ").trim()}${end < body.length ? " …" : ""}`;
}

export async function searchSiteContent(
  query: string,
  opts: SearchOptions = {},
): Promise<SiteSearchResult[]> {
  const { maxResults = 8 } = opts;
  const knowledge = await loadAgentKnowledge();
  if (knowledge.documents.length === 0) return [];

  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter((t) => t.length >= 2);
  if (terms.length === 0) return [];

  // Score per doc: title match (3), summary (2), tag (2), body term (1 per term).
  const scores = new Map<string, number>();

  for (const doc of knowledge.documents) {
    const title = doc.title.toLowerCase();
    const summary = doc.summary.toLowerCase();
    const body = doc.body.toLowerCase();
    const tagSet = new Set(doc.tags.map((t) => t.toLowerCase()));
    let score = 0;

    for (const term of terms) {
      if (title.includes(term)) score += 3;
      if (summary.includes(term)) score += 2;
      if (tagSet.has(term)) score += 2;
      if (body.includes(term)) score += 1;
    }

    if (score > 0) scores.set(doc.id, score);
  }

  const ranked = [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxResults);

  const docById = new Map(knowledge.documents.map((d) => [d.id, d]));

  return ranked.map(([id, score]) => {
    const doc = docById.get(id)!;
    return {
      id: doc.id,
      title: doc.title,
      slug: doc.slug,
      kind: doc.kind,
      url: doc.url,
      summary: doc.summary,
      tags: doc.tags,
      excerpts: [excerpt(doc.body, terms)],
      wikilinks: doc.wikilinks,
      score,
    };
  });
}

// ── Read ─────────────────────────────────────────────────────────────────────

export interface SiteNote {
  id: string;
  title: string;
  slug: string;
  kind: AgentDocument["kind"];
  url: string;
  summary: string;
  tags: string[];
  frontmatter: Record<string, unknown>;
  body: string;
  wikilinks: string[];
  related: string[];
  headings: Array<{ depth: number; text: string }>;
}

function normalizeKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, "-");
}

export async function readSiteNote(nameOrIdOrSlug: string): Promise<SiteNote | null> {
  const knowledge = await loadAgentKnowledge();
  if (knowledge.documents.length === 0) return null;

  const key = normalizeKey(nameOrIdOrSlug);

  const byExact = knowledge.documents.find((d) => d.id === nameOrIdOrSlug);
  if (byExact) return toSiteNote(byExact);

  const bySlug = knowledge.documents.find((d) => d.slug === key);
  if (bySlug) return toSiteNote(bySlug);

  const byTitle = knowledge.documents.find(
    (d) => normalizeKey(d.title) === key || d.title.toLowerCase() === nameOrIdOrSlug.toLowerCase(),
  );
  if (byTitle) return toSiteNote(byTitle);

  return null;
}

function toSiteNote(d: AgentDocument): SiteNote {
  return {
    id: d.id,
    title: d.title,
    slug: d.slug,
    kind: d.kind,
    url: d.url,
    summary: d.summary,
    tags: d.tags,
    frontmatter: d.frontmatter,
    body: d.body,
    wikilinks: d.wikilinks,
    related: d.related,
    headings: d.headings,
  };
}

// ── Traverse ─────────────────────────────────────────────────────────────────

export interface TraverseOptions {
  edgeTypes?: AgentGraphEdgeType[];
  depth?: 1 | 2;
  maxNeighbors?: number;
}

export interface Neighbor {
  node: AgentGraphNode;
  edgeType: AgentGraphEdgeType;
  hops: 1 | 2;
}

export interface TraverseResult {
  seed: AgentGraphNode | null;
  neighbors: Neighbor[];
}

export async function traverseFrom(
  seedKey: string,
  opts: TraverseOptions = {},
): Promise<TraverseResult> {
  const {
    edgeTypes = ["wikilink", "reference", "tag"],
    depth = 1,
    maxNeighbors = 10,
  } = opts;
  const knowledge = await loadAgentKnowledge();
  if (knowledge.graph.nodes.length === 0) return { seed: null, neighbors: [] };

  const nodeById = new Map(knowledge.graph.nodes.map((n) => [n.id, n]));

  // Resolve seed: accept id, slug, title, or tag name.
  const seed =
    nodeById.get(seedKey) ??
    nodeById.get(`tag:${seedKey}`) ??
    knowledge.graph.nodes.find(
      (n) => n.label.toLowerCase() === seedKey.toLowerCase(),
    ) ??
    knowledge.graph.nodes.find((n) => n.id.endsWith(`/${normalizeKey(seedKey)}`)) ??
    null;

  if (!seed) return { seed: null, neighbors: [] };

  const allowedEdgeTypes = new Set(edgeTypes);
  const visited = new Set<string>([seed.id]);
  const neighbors: Neighbor[] = [];

  const hop1: Array<{ id: string; type: AgentGraphEdgeType }> = [];
  for (const link of knowledge.graph.links) {
    if (!allowedEdgeTypes.has(link.type)) continue;
    if (link.source === seed.id && !visited.has(link.target)) {
      hop1.push({ id: link.target, type: link.type });
    } else if (link.target === seed.id && !visited.has(link.source)) {
      hop1.push({ id: link.source, type: link.type });
    }
  }

  for (const { id, type } of hop1) {
    if (visited.has(id)) continue;
    visited.add(id);
    const node = nodeById.get(id);
    if (!node) continue;
    neighbors.push({ node, edgeType: type, hops: 1 });
    if (neighbors.length >= maxNeighbors) break;
  }

  if (depth === 2 && neighbors.length < maxNeighbors) {
    const level1Ids = neighbors.map((n) => n.node.id);
    for (const link of knowledge.graph.links) {
      if (!allowedEdgeTypes.has(link.type)) continue;
      for (const parentId of level1Ids) {
        let nextId: string | null = null;
        if (link.source === parentId && !visited.has(link.target)) nextId = link.target;
        else if (link.target === parentId && !visited.has(link.source)) nextId = link.source;
        if (!nextId) continue;
        visited.add(nextId);
        const node = nodeById.get(nextId);
        if (!node) continue;
        neighbors.push({ node, edgeType: link.type, hops: 2 });
        if (neighbors.length >= maxNeighbors) break;
      }
      if (neighbors.length >= maxNeighbors) break;
    }
  }

  return { seed, neighbors };
}
```

- [ ] **Step 5: Run tests — all should pass**

Run: `bunx vitest run lib/ai/knowledge/site-content.test.ts`
Expected: all tests PASS.

- [ ] **Step 6: Format**

Run: `bun format lib/ai/knowledge/` (or `bunx ultracite@6.3.3 fix lib/ai/knowledge/`)
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add lib/ai/knowledge/
git commit -m "feat(chat): runtime loader + search/read/traverse over agent knowledge"
```

---

## Task 6 — Wire site-content into `searchKnowledge` + `readKnowledgeNote`

**Files:**
- Modify: `lib/ai/tools/knowledge-graph.ts`

- [ ] **Step 1: Replace the top import block**

Find the existing imports at the top of `lib/ai/tools/knowledge-graph.ts`:

```ts
import { tool } from "ai";
import { z } from "zod";
import { createModuleLogger } from "@/lib/logger";
import { config } from "@/lib/config";
import {
  extractWikilinks,
  resolveWikilink,
  searchVault,
} from "../vault/reader";
import { LagoVaultBackend } from "../vault/lago-backend";
import { signLagoJWT } from "../vault/jwt";
import type { ToolSession } from "./types";
```

Add an import for the new site-content module right after the existing relative imports:

```ts
import {
  searchSiteContent as searchAgentSiteContent,
  readSiteNote,
  traverseFrom,
} from "@/lib/ai/knowledge/site-content";
```

- [ ] **Step 2: Delete the old `searchSiteContent` function**

Find and delete the existing `async function searchSiteContent(query, maxResults)` (lines 51–118 of the current file — the Lago-manifest path-match version). It is replaced by the import above.

- [ ] **Step 3: Update the `searchKnowledgeTool` factory**

Inside `searchKnowledgeTool({ session })`, find the block that currently does:

```ts
// 3. Site content (lagod — public session, unauthenticated)
try {
  const siteResults = await searchSiteContent(query, maxResults);
  allResults.push(...siteResults);
} catch (error) {
  log.error({ err: error, query }, "Site content search error");
}
```

Replace it with:

```ts
// 3. Site content (in-repo knowledge graph from public/agent-knowledge.json)
try {
  const siteResults = await searchAgentSiteContent(query, { maxResults });
  for (const r of siteResults) {
    allResults.push({
      name: r.title,
      path: r.url,
      frontmatter: { kind: r.kind, tags: r.tags },
      excerpts: r.excerpts,
      outgoingLinks: r.wikilinks,
      score: r.score,
      source: "site",
    });
  }
} catch (error) {
  log.error({ err: error, query }, "Site content search error");
}
```

- [ ] **Step 4: Update the `readKnowledgeNoteTool` factory to try site-content first**

Inside `readKnowledgeNoteTool({ session })`, the `execute` function currently starts with "Try server vault first". Prepend a site-content attempt **before** the server-vault attempt:

```ts
// Try site-content (public knowledge graph, always available in production)
try {
  const siteNote = await readSiteNote(name);
  if (siteNote) {
    return {
      name: siteNote.title,
      path: siteNote.url,
      frontmatter: siteNote.frontmatter,
      content: truncateBody(siteNote.body, 6000),
      outgoingLinks: siteNote.wikilinks,
      source: "site",
      ...(includeLinkedNotes && siteNote.wikilinks.length > 0
        ? {
            linkedNotes: await Promise.all(
              siteNote.wikilinks.slice(0, 10).map(async (wl) => {
                const linked = await readSiteNote(wl);
                return linked
                  ? {
                      name: linked.title,
                      path: linked.url,
                      excerpt: truncateBody(linked.body, 300),
                    }
                  : null;
              }),
            ).then((arr) => arr.filter((n): n is NonNullable<typeof n> => n !== null)),
          }
        : {}),
    };
  }
} catch (error) {
  log.error({ err: error, name }, "Site-content read error");
}
```

- [ ] **Step 5: Add the new `traverseKnowledgeTool` factory at the bottom of the file**

Before the trailing backward-compat exports (`export const searchKnowledge = ...` etc.), add:

```ts
/**
 * Factory: traverseKnowledge tool.
 *
 * Walks the public agent knowledge graph (wikilinks, tags, `related:`) from a
 * seed node. Answers "what connects to X" and "what's in the neighborhood of Y"
 * questions without repeated searches.
 */
export function traverseKnowledgeTool(_: { session: ToolSession }) {
  return tool({
    description: `Traverse the public Broomva knowledge graph from a seed node. Follows wikilink, tag, and related-frontmatter edges.

Use when the user asks:
- "what's connected to X?"
- "how does X relate to Y?"
- "what else is in the X neighborhood?"
- "show me everything tagged X"

Prefer this over repeated searchKnowledge calls for graph-shape questions. The seed can be a document id (e.g. "writing/agent-native-architecture"), a slug, a title, or a tag name (e.g. "agent-os" resolves to "tag:agent-os").`,
    inputSchema: z.object({
      seed: z
        .string()
        .describe(
          'Seed node — document id ("writing/foo"), slug, title, or tag name.',
        ),
      edgeTypes: z
        .array(z.enum(["wikilink", "reference", "tag"]))
        .default(["wikilink", "reference", "tag"])
        .describe(
          "Which edge types to follow. Default follows all three.",
        ),
      depth: z
        .union([z.literal(1), z.literal(2)])
        .default(1)
        .describe("1 for immediate neighbors, 2 for neighbors-of-neighbors"),
      maxNeighbors: z
        .number()
        .int()
        .min(1)
        .max(30)
        .default(10)
        .describe("Maximum neighbors to return"),
    }),
    execute: async ({
      seed,
      edgeTypes,
      depth,
      maxNeighbors,
    }: {
      seed: string;
      edgeTypes: ("wikilink" | "reference" | "tag")[];
      depth: 1 | 2;
      maxNeighbors: number;
    }) => {
      const result = await traverseFrom(seed, { edgeTypes, depth, maxNeighbors });
      if (!result.seed) {
        return {
          error: `Seed "${seed}" not found in the public knowledge graph.`,
        };
      }
      return {
        seed: {
          id: result.seed.id,
          label: result.seed.label,
          type: result.seed.type,
          url: result.seed.url,
          tags: result.seed.tags,
        },
        neighbors: result.neighbors.map((n) => ({
          id: n.node.id,
          label: n.node.label,
          type: n.node.type,
          url: n.node.url,
          summary: n.node.summary,
          tags: n.node.tags,
          edgeType: n.edgeType,
          hops: n.hops,
        })),
      };
    },
  });
}
```

- [ ] **Step 6: Add backward-compat export**

At the bottom of the file, below the existing `export const searchKnowledge = ...` / `readKnowledgeNote`, add:

```ts
export const traverseKnowledge = traverseKnowledgeTool({
  session: { user: undefined },
});
```

- [ ] **Step 7: Type-check**

Run: `bun test:types 2>&1 | grep -E '(knowledge-graph|site-content)' | head -20`
Expected: no errors for these files.

- [ ] **Step 8: Commit**

```bash
git add lib/ai/tools/knowledge-graph.ts
git commit -m "feat(chat): wire agent-knowledge into searchKnowledge + readKnowledgeNote + new traverseKnowledge tool"
```

---

## Task 7 — Register `traverseKnowledge` across tool registry, schema, and types

**Files:**
- Modify: `lib/ai/tools/tools.ts`
- Modify: `lib/ai/tools/tools-definitions.ts`
- Modify: `lib/ai/types.ts`

- [ ] **Step 1: Update the import in `tools.ts`**

Find:
```ts
import {
  searchKnowledgeTool,
  readKnowledgeNoteTool,
} from "@/lib/ai/tools/knowledge-graph";
```
Replace with:
```ts
import {
  searchKnowledgeTool,
  readKnowledgeNoteTool,
  traverseKnowledgeTool,
} from "@/lib/ai/tools/knowledge-graph";
```

- [ ] **Step 2: Register `traverseKnowledge` in the tool registry**

In `tools.ts` find:
```ts
    ...(config.features.knowledgeGraph
      ? {
          searchKnowledge: searchKnowledgeTool({ session }),
          readKnowledgeNote: readKnowledgeNoteTool({ session }),
        }
      : {}),
```
Replace with:
```ts
    ...(config.features.knowledgeGraph
      ? {
          searchKnowledge: searchKnowledgeTool({ session }),
          readKnowledgeNote: readKnowledgeNoteTool({ session }),
          traverseKnowledge: traverseKnowledgeTool({ session }),
        }
      : {}),
```

- [ ] **Step 3: Add a definition in `tools-definitions.ts`**

After the existing `readKnowledgeNote` entry (ends near line 80 with `cost: 0, // filesystem only`), add:

```ts
  traverseKnowledge: {
    name: "traverseKnowledge",
    description: "Traverse the knowledge graph via wikilink/tag/related edges",
    cost: 0, // filesystem only
  },
```

- [ ] **Step 4: Update `toolNameSchema` in `types.ts`**

Find the schema:
```ts
export const toolNameSchema = z.enum([
  ...
  "searchKnowledge",
  "readKnowledgeNote",
  ...
```
Add `"traverseKnowledge"` immediately after `"readKnowledgeNote"`:

```ts
export const toolNameSchema = z.enum([
  ...
  "searchKnowledge",
  "readKnowledgeNote",
  "traverseKnowledge",
  ...
```

- [ ] **Step 5: Add the type alias in `types.ts`**

In `types.ts`, find:
```ts
import type {
  searchKnowledge,
  readKnowledgeNote,
} from "@/lib/ai/tools/knowledge-graph";
```
Replace with:
```ts
import type {
  searchKnowledge,
  readKnowledgeNote,
  traverseKnowledge,
} from "@/lib/ai/tools/knowledge-graph";
```

Then find:
```ts
type searchKnowledgeTool = InferUITool<typeof searchKnowledge>;
type readKnowledgeNoteTool = InferUITool<typeof readKnowledgeNote>;
```
Add below:
```ts
type traverseKnowledgeTool = InferUITool<typeof traverseKnowledge>;
```

And in the `ChatTools` object literal, after `readKnowledgeNote: readKnowledgeNoteTool;` add:
```ts
  traverseKnowledge: traverseKnowledgeTool;
```

- [ ] **Step 6: Type-check the whole app**

Run: `bun test:types 2>&1 | tail -40`
Expected: no new errors introduced by these files.

- [ ] **Step 7: Commit**

```bash
git add lib/ai/tools/tools.ts lib/ai/tools/tools-definitions.ts lib/ai/types.ts
git commit -m "feat(chat): register traverseKnowledge in tool registry + types"
```

---

## Task 8 — Rewrite `lib/ai/prompts.ts` into a 5-layer assembler

**Files:**
- Modify: `lib/ai/prompts.ts`

- [ ] **Step 1: Replace the entire file**

Overwrite `lib/ai/prompts.ts` with:

```ts
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
 * The previous `systemPrompt()` export is kept as a deprecated thin wrapper
 * that calls `buildSystemPrompt({})` so any stray callers keep working. It
 * can be removed in a follow-up commit once nothing references it.
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
    ? "Your user vault is available — use \`searchKnowledge\` for personal/private context."
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

/** @deprecated Use {@link buildSystemPrompt} — scheduled for removal once no caller depends on the old signature. */
export function systemPrompt(): string {
  log.warn("Legacy systemPrompt() called — use buildSystemPrompt() instead");
  return `${getIdentity()}\n\n${NAVIGATION_HINTS}\n\n${TOOL_PROTOCOL}`;
}
```

- [ ] **Step 2: Type-check**

Run: `bun test:types 2>&1 | grep -E 'prompts\.ts' | head`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/ai/prompts.ts
git commit -m "feat(chat): rewrite systemPrompt as 5-layer Arcan prompt assembler"
```

---

## Task 9 — Wire `buildSystemPrompt` into the chat route

**Files:**
- Modify: `app/(chat)/api/chat/route.ts`

- [ ] **Step 1: Update the import**

Find at the top of `route.ts`:
```ts
import { systemPrompt } from "@/lib/ai/prompts";
```
Replace with:
```ts
import { buildSystemPrompt } from "@/lib/ai/prompts";
```

- [ ] **Step 2: Rewrite `getSystemPrompt`**

Find the existing function (~ lines 427–445):

```ts
async function getSystemPrompt({
  isAnonymous,
  chatId,
}: {
  isAnonymous: boolean;
  chatId: string;
}): Promise<string> {
  let system = systemPrompt();
  if (!isAnonymous) {
    const currentChat = await getChatById({ id: chatId });
    if (currentChat?.projectId) {
      const project = await getProjectById({ id: currentChat.projectId });
      if (project?.instructions) {
        system = `${system}\n\nProject instructions:\n${project.instructions}`;
      }
    }
  }
  return system;
}
```

Replace with:

```ts
async function getSystemPrompt({
  isAnonymous,
  chatId,
  userName,
}: {
  isAnonymous: boolean;
  chatId: string;
  userName?: string | null;
}): Promise<string> {
  let system = await buildSystemPrompt({
    isAnonymous,
    userName,
    memoryVaultAvailable: config.features.memoryVault && !isAnonymous,
  });
  if (!isAnonymous) {
    const currentChat = await getChatById({ id: chatId });
    if (currentChat?.projectId) {
      const project = await getProjectById({ id: currentChat.projectId });
      if (project?.instructions) {
        system = `${system}\n\n---\n\n## Project instructions\n\n${project.instructions}`;
      }
    }
  }
  return system;
}
```

- [ ] **Step 3: Verify `config` is already imported at the top of route.ts**

Run: `grep -n 'from "@/lib/config"' app/\(chat\)/api/chat/route.ts`
Expected: one match. If missing, add `import { config } from "@/lib/config";` next to the other top-level imports.

- [ ] **Step 4: Pass `userName` into `getSystemPrompt`**

Find the single call-site of `getSystemPrompt(` inside the same file. It currently receives `{ isAnonymous, chatId }`. Add the user's name — search nearby for where `session` is already resolved; the existing code has a `session` variable with `session.user?.name`. Replace:

```ts
const system = await getSystemPrompt({ isAnonymous, chatId });
```

With:

```ts
const system = await getSystemPrompt({
  isAnonymous,
  chatId,
  userName: isAnonymous ? null : session?.user?.name ?? null,
});
```

(If the variable name isn't exactly `session`, use whatever holds the auth session in this function — the only change is passing the user's display name.)

- [ ] **Step 5: Type-check**

Run: `bun test:types 2>&1 | grep -E 'route\.ts' | head`
Expected: no errors introduced.

- [ ] **Step 6: Smoke-test locally**

In a separate terminal, ensure the dev DB is up and run:

```bash
bun run generate:agent-knowledge
bun run dev
```

Open `http://localhost:3001/chat`, send: `Who are you?`
Expected: response introduces itself as Arcan, mentions Broomva, mentions Carlos by name, no URL hallucinations.

Send: `What projects are pinned right now?`
Expected: response lists actual pinned project URLs from content/projects/*.mdx (check one by clicking through).

If it works, stop the dev server.

- [ ] **Step 7: Commit**

```bash
git add app/\(chat\)/api/chat/route.ts
git commit -m "feat(chat): wire buildSystemPrompt + userName into chat route"
```

---

## Task 10 — Eval: identity

**Files:**
- Create: `evals/identity.eval.ts`

- [ ] **Step 1: Write the eval**

```ts
import { evalite } from "evalite";
import { runCoreChatAgentEval } from "@/lib/ai/eval-agent";
import type { ChatMessage } from "@/lib/ai/types";
import { generateUUID } from "@/lib/utils";

const MODEL = "anthropic/claude-haiku-4.5" as const;

function userMessage(text: string): ChatMessage {
  return {
    id: generateUUID(),
    role: "user",
    parts: [{ type: "text", text }],
    metadata: {
      createdAt: new Date(),
      parentMessageId: null,
      selectedModel: MODEL,
      activeStreamId: null,
    },
  };
}

evalite("Arcan Identity Eval", {
  data: async () => [
    {
      input: "Who are you?",
      expected: ["arcan", "broomva"],
    },
    {
      input: "Who is Carlos?",
      expected: ["carlos", "engineer"],
    },
    {
      input: "What is Broomva?",
      expected: ["agent os", "life", "arcan"],
    },
  ],
  task: async (input) => {
    const result = await runCoreChatAgentEval({
      userMessage: userMessage(input),
      previousMessages: [],
      selectedModelId: MODEL,
      activeTools: [],
    });
    return result.finalText;
  },
  scorers: [
    {
      name: "ContainsAllExpected",
      description: "All expected substrings must appear (case-insensitive).",
      scorer: ({ output, expected }) => {
        const lower = output.toLowerCase();
        const terms = expected as string[];
        const hits = terms.filter((t) => lower.includes(t.toLowerCase())).length;
        return hits === terms.length ? 1 : hits / terms.length;
      },
    },
  ],
});
```

- [ ] **Step 2: Run the eval**

Run: `bunx evalite run evals/identity.eval.ts`
Expected: score averages ≥ 0.8. If below, the identity MDX needs more of the expected surface area — adjust and rerun.

- [ ] **Step 3: Commit**

```bash
git add evals/identity.eval.ts
git commit -m "test(chat): add identity eval for Arcan system prompt"
```

---

## Task 11 — Eval: KG retrieval

**Files:**
- Create: `evals/kg-retrieval.eval.ts`

- [ ] **Step 1: Confirm the expected corpus exists**

Run: `ls content/writing | head -5`
Expected: non-empty. Pick one real slug (e.g. `agent-native-architecture.mdx`) to use as the canonical retrieval target. Substitute that slug in the eval below if the one we picked doesn't exist in this repo.

- [ ] **Step 2: Write the eval**

```ts
import { evalite } from "evalite";
import { runCoreChatAgentEval } from "@/lib/ai/eval-agent";
import type { ChatMessage } from "@/lib/ai/types";
import { generateUUID } from "@/lib/utils";

const MODEL = "anthropic/claude-haiku-4.5" as const;

function userMessage(text: string): ChatMessage {
  return {
    id: generateUUID(),
    role: "user",
    parts: [{ type: "text", text }],
    metadata: {
      createdAt: new Date(),
      parentMessageId: null,
      selectedModel: MODEL,
      activeStreamId: null,
    },
  };
}

evalite("KG Retrieval Eval", {
  data: async () => [
    {
      // Pick a writing slug that actually exists in content/writing/.
      input: "Tell me about the agent-native architecture essay.",
      expected: { urlSubstring: "/writing/agent-native-architecture" },
    },
    {
      input: "What prompts do you have for deep research?",
      expected: { urlSubstring: "/prompts/deep-research-agent" },
    },
  ],
  task: async (input) => {
    const result = await runCoreChatAgentEval({
      userMessage: userMessage(input),
      previousMessages: [],
      selectedModelId: MODEL,
      activeTools: ["searchKnowledge", "readKnowledgeNote"],
    });
    return result.finalText;
  },
  scorers: [
    {
      name: "CitesExpectedURL",
      description: "Response must include the expected URL substring.",
      scorer: ({ output, expected }) => {
        const needle = (expected as { urlSubstring: string }).urlSubstring.toLowerCase();
        return output.toLowerCase().includes(needle) ? 1 : 0;
      },
    },
  ],
});
```

- [ ] **Step 3: Run the eval**

Run: `bunx evalite run evals/kg-retrieval.eval.ts`
Expected: score ≥ 0.8. If below, check that `public/agent-knowledge.json` is up to date (`bun run generate:agent-knowledge`) and that the slugs used in `expected` exist under `content/`.

- [ ] **Step 4: Commit**

```bash
git add evals/kg-retrieval.eval.ts
git commit -m "test(chat): add KG retrieval eval for site-content tools"
```

---

## Task 12 — Eval: connectivity (traverse)

**Files:**
- Create: `evals/connectivity.eval.ts`

- [ ] **Step 1: Write the eval**

```ts
import { evalite } from "evalite";
import { runCoreChatAgentEval } from "@/lib/ai/eval-agent";
import type { ChatMessage } from "@/lib/ai/types";
import { generateUUID } from "@/lib/utils";

const MODEL = "anthropic/claude-haiku-4.5" as const;

function userMessage(text: string): ChatMessage {
  return {
    id: generateUUID(),
    role: "user",
    parts: [{ type: "text", text }],
    metadata: {
      createdAt: new Date(),
      parentMessageId: null,
      selectedModel: MODEL,
      activeStreamId: null,
    },
  };
}

evalite("KG Connectivity Eval", {
  data: async () => [
    {
      input: "Show me everything in our knowledge graph tagged agent-os.",
      expected: { minLinkCount: 2, mustContain: "/" },
    },
    {
      input: "What's connected to the Life Agent OS project?",
      expected: { minLinkCount: 2, mustContain: "/" },
    },
  ],
  task: async (input) => {
    const result = await runCoreChatAgentEval({
      userMessage: userMessage(input),
      previousMessages: [],
      selectedModelId: MODEL,
      activeTools: ["searchKnowledge", "readKnowledgeNote", "traverseKnowledge"],
    });
    return result.finalText;
  },
  scorers: [
    {
      name: "HasEnoughLinks",
      description: "Response must include at least minLinkCount markdown links.",
      scorer: ({ output, expected }) => {
        const exp = expected as { minLinkCount: number; mustContain: string };
        const links = [...output.matchAll(/\]\((\/[^)]+)\)/g)].map((m) => m[1]);
        const ok =
          links.length >= exp.minLinkCount &&
          links.some((l) => l.includes(exp.mustContain));
        return ok ? 1 : 0;
      },
    },
  ],
});
```

- [ ] **Step 2: Run the eval**

Run: `bunx evalite run evals/connectivity.eval.ts`
Expected: score ≥ 0.8. If below, inspect the tool call log — the model may be searching instead of traversing. Tighten Layer 4 of the prompt to insist on `traverseKnowledge` for connection questions, regenerate knowledge, rerun.

- [ ] **Step 3: Commit**

```bash
git add evals/connectivity.eval.ts
git commit -m "test(chat): add connectivity eval for traverseKnowledge tool"
```

---

## Task 13 — Full smoke test

**Files:** (none modified — verification only)

- [ ] **Step 1: Clean rebuild the knowledge artifact**

Run:
```bash
rm -f public/agent-knowledge.json
bun run generate:agent-knowledge
```
Expected: file regenerated; counts non-zero.

- [ ] **Step 2: Run unit tests**

Run: `bun test:unit 2>&1 | tail -20`
Expected: all tests pass (at minimum the new site-content tests from Task 5).

- [ ] **Step 3: Type-check**

Run: `bun test:types 2>&1 | tail -20`
Expected: no new errors introduced by this branch.

- [ ] **Step 4: Full production build**

Run: `bun run build 2>&1 | tail -40`
Expected: build completes. `public/agent-knowledge.json` regenerated via prebuild. Next build succeeds.

- [ ] **Step 5: Verify bundle tracing**

Run:
```bash
find .next -name "agent-knowledge.json" 2>/dev/null
```
Expected: at least one hit under `.next/server/` or `.next/standalone/`. If empty, the `outputFileTracingIncludes` paths in `next.config.ts` didn't match — adjust the globs to match the actual route manifest, regenerate, re-check.

- [ ] **Step 6: Hand off for review**

No commit in this task — it's verification only. If all steps pass, the branch is ready for review. If any step fails, address it and re-run from Step 1.

---

## Self-Review

**Spec coverage check:**
- Arcan identity baked (Task 1, 8) ✓
- Live index per-request (Task 8 — `buildLiveIndex`) ✓
- KG navigation hints baked (Task 8 — `NAVIGATION_HINTS`) ✓
- Tool protocol baked (Task 8 — `TOOL_PROTOCOL`) ✓
- Per-request auth-gated user context (Task 8 — `formatUserContext`, Task 9 — passes `userName`) ✓
- Build-time `public/agent-knowledge.json` with bodies + graph + inverted index (Task 3) ✓
- `outputFileTracingIncludes` for the chat route (Task 4) ✓
- `site-content` source in `searchKnowledge` / `readKnowledgeNote` (Tasks 5, 6) ✓
- New `traverseKnowledge` tool registered everywhere (Tasks 6, 7) ✓
- Three evals: identity / KG retrieval / connectivity (Tasks 10, 11, 12) ✓
- VAULT_PATH kept for local dev, Lago user vault kept auth-gated — no change needed (unchanged code in `knowledge-graph.ts` outside the two hunks we edit) ✓
- Landing page unchanged (no task — spec confirms) ✓

**Placeholder scan:** Every step has a concrete command, file path, or code block. The only "adjust if …" lines are conditional recovery steps (Task 4 Step 5, Task 11 Step 1, Task 12 Step 2), which are acceptable because they show the concrete action to take in each branch.

**Type consistency:** `AgentKnowledge`, `AgentDocument`, `AgentGraphNode`, `AgentGraphEdge`, and their property names (`documents`, `graph.nodes`, `graph.links`, `invertedIndex`) are used consistently between Task 2 (types), Task 3 (generator), Task 5 (loader + tests), Task 6 (tool wiring). Tool names (`searchKnowledge`, `readKnowledgeNote`, `traverseKnowledge`) are consistent across tasks 6, 7, 10, 11, 12. Factory naming (`searchKnowledgeTool`, `readKnowledgeNoteTool`, `traverseKnowledgeTool`) is consistent between `knowledge-graph.ts` (Task 6) and `tools.ts` (Task 7).
