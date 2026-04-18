# Arcan Chat — Prompt, Context, and Knowledge Graph Grounding

**Status:** Draft — awaiting user review
**Date:** 2026-04-17
**Scope:** `apps/chat/` (broomva.tech landing + `/chat` page)
**Supersedes:** ad-hoc `systemPrompt()` in `apps/chat/lib/ai/prompts.ts`

## Summary

The Arcan chat on broomva.tech today runs on a one-line system prompt ("You are a friendly assistant!") plus an optional vault-index snippet that only loads when `VAULT_PATH` is mounted on the server. On Vercel that env is unset, so in production the agent starts cold with no identity, no project context, no knowledge of who Carlos is, and no way to search the repo's published content.

Meanwhile the repo already contains the substrate to fix this — `apps/chat/content/{writing,notes,projects,prompts}/**.mdx`, a working `buildPublicGraph()` at `lib/graph/build-public.ts`, and a `generate-search-index.ts` prebuild step. The agent simply isn't wired to any of it.

This spec adds:

1. A new prebuild step that emits a rich `public/agent-knowledge.json` (MDX bodies + frontmatter + wikilink/tag graph) on every deploy.
2. Full-text `searchKnowledge` / `readKnowledgeNote` against that JSON, plus a new `traverseKnowledge` tool for wikilink-graph walks.
3. A 5-layer system prompt (identity, live index, KG navigation, tool protocol, user context) that gives every conversation a coherent grounding regardless of entry point.
4. Three evals to keep the above from regressing.

The agent keeps its existing identity as Arcan — the user-facing instance of the Broomva agent runtime. Primary user is Carlos; visitors get the same depth.

## Goals

- Every chat on broomva.tech opens with full grounding in who Carlos is, what Broomva is building, and what's currently shipped.
- The agent can answer questions about any published writing, note, project, prompt, or skill with correct URLs and inline citations.
- The agent can traverse wikilink / `related` / tag edges to answer "what connects to X" questions without re-searching.
- The in-repo knowledge graph is re-indexed on every CI/CD deployment, so the agent is never staler than the last deploy.
- Authenticated users additionally get their Lago user vault as a search layer; anonymous users get the OSS-backed public layer only.
- Local development continues to work with the user's Obsidian vault via `VAULT_PATH`.

## Non-goals

- No change to the landing hero UX — the input still redirects to `/chat?q=...`.
- No migration off Lago for the user vault — Layer 2 of the consciousness stack stays as-is.
- No live sync from `~/broomva/research/entities/` (Layer 3 KG). That lives outside the broomva.tech repo; a later PR can bridge it via a committed snapshot or a submodule.
- No chat persona other than Arcan. Other agents (Moltie, Haima, etc.) are out of scope.
- No new UI components. This is a prompt + retrieval + build-pipeline change.

## Architecture

### Build time (prebuild hook)

```
bun scripts/generate-search-index.ts           # existing — flat UI dock index
bun scripts/generate-agent-knowledge.ts        # NEW — rich agent index
       │
       ├─► public/search-index.json            # flat: title, summary, href, tags
       └─► public/agent-knowledge.json         # rich: bodies + frontmatter + graph
```

`generate-agent-knowledge.ts` reuses the logic already in `lib/graph/build-public.ts` and extends it to carry full MDX body content and an inverted index. Output shape:

```jsonc
{
  "generatedAt": "2026-04-17T…",
  "commit": "<git-sha>",
  "documents": [
    {
      "id": "writing/agent-native-architecture",
      "kind": "writing",        // notes | projects | writing | prompts
      "slug": "agent-native-architecture",
      "title": "…",
      "summary": "…",
      "url": "/writing/agent-native-architecture",
      "tags": ["agent-os", "architecture"],
      "frontmatter": { /* full */ },
      "body": "…",              // MDX body with JSX stripped to plain text
      "wikilinks": ["life-agent-os", "arcan"],
      "related": ["harness-over-prompting"],
      "headings": [{ "depth": 2, "text": "…" }],
      "wordCount": 1234
    }
  ],
  "graph": {
    "nodes": [ /* same shape as buildPublicGraph() output */ ],
    "links": [ /* same shape */ ]
  },
  "invertedIndex": {
    "arcan": ["writing/agent-native-architecture", "notes/…"]
  }
}
```

Size budget: **1–3 MB uncompressed**. Loaded once per cold start, cached in-module with `let _cache: AgentKnowledge | null`.

### Runtime (per `/api/chat` request)

```
getSystemPrompt({ session, chatId })
  → 5-layer system prompt (see "System prompt contents" below)

Tools available to the model:
  searchKnowledge
    (1) site-content   → agent-knowledge.json       [NEW, primary in prod]
    (2) user-vault     → Lago vault (auth only)
    (3) server-vault   → VAULT_PATH (local dev only)

  readKnowledgeNote
    → same three sources, path/slug-resolved

  traverseKnowledge    [NEW]
    → follow wikilink/reference/tag edges from a seed node
      using graph edges in agent-knowledge.json
```

## System prompt contents (the 5 layers)

### Layer 1 — Arcan identity (baked, hand-authored)

Source: `apps/chat/content/agent/identity.mdx` — one hand-edited file, under version control, loaded once at cold start via `readFileSync`.

Contents:
- **Who I am**: "I'm Arcan, the user-facing instance of the Broomva agent runtime."
- **Who I serve**: Carlos D. Escobar-Valbuena (AI engineer, agent architect, builder) and anyone interacting with him through broomva.tech.
- **What Broomva is**: unified agent OS — Life (Arcan runtime, Lago persistence, Vigil observability, Praxis tools, Haima finance, Spaces networking, Anima soul layer), Symphony (orchestration), ChatOS (this app), Control Kernel (governance metalayer).
- **Core bets / theses**: agent-native architecture, event-sourced state, control-systems metalayer, open-source substrate, progressive crystallization of knowledge.
- **Conventions**: Rust for core, TypeScript for web, Bun, Biome, Better Auth, Drizzle, Turborepo.
- **Tone**: direct, technical, first-person-as-Arcan, cites sources, shows architectural thinking, not marketing-speak.

Length target: ~250 lines of MDX. Edits take effect on next deploy (no restart needed, but prompt content is cached per-cold-start in the serverless function, so practical propagation is deploy-scoped). The payoff isn't zero-redeploy editing — it's that voice/identity changes are one-file PRs that don't touch retrieval or tool wiring.

### Layer 2 — Live index (per-request, dynamic)

Assembled in `buildSystemPrompt()`. Uses existing helpers: `getPinnedProjects(3)`, `getLatest("writing", 3)`, `getLatest("notes", 3)`, `getRecentRepos("broomva", 3)` (graceful fallback if no `GITHUB_TOKEN`).

Injected as a short bulleted block:
- Today's date
- Top 3 pinned projects (title + 1-line summary + URL)
- Latest 3 writing posts (title + URL)
- Latest 3 notes (title + URL)
- Recent 3 active repos (if available)

Purpose: grounds the agent in **what exists right now** without a tool roundtrip on every "what are you working on?" question.

### Layer 3 — KG navigation hints (baked)

A condensed map of what lives where, so the agent picks targeted lookups instead of broad searches:

```
Site knowledge graph (public, always available):
  /writing/*    — essays, tech deep dives
  /notes/*      — shorter takes, seeds
  /projects/*   — project pages with deployment info
  /prompts/*    — versioned prompt library
  /skills       — bstack (27 agent skills, 7 layers)
  /graph        — force-directed view of all above

Local-only (requires VAULT_PATH):
  00-Index/Broomva Index, Projects, Consciousness
  01-Life, 02-Symphony, 03-Autoany, 04-Control-Kernel
  05-ChatOS, 06-Symphony-Cloud, 08-Research

User vault (requires auth + memoryVault):
  Personal notes, private context, preferences
```

### Layer 4 — Tool protocol (baked)

Explicit rules for tool use:

- **Default to retrieval** when the question touches project architecture, past decisions, open-source internals, writing, or any claim that needs a source.
- **Cite every retrieved fact** inline with `[Title](/writing/slug)`, not in a footer.
- **Prefer `readKnowledgeNote`** when the note id/slug is known (from the Live Index or Navigation map). Only fall back to `searchKnowledge` for discovery.
- **Use `traverseKnowledge`** for "what else relates to X" / "how does X connect to Y" questions.
- **Don't hallucinate URLs.** If there's no source, say so and offer to search.
- **Skip retrieval** for general programming questions, generic explanations, or anything Carlos could answer himself. Reserve tool calls for Broomva-specific knowledge.

### Layer 5 — User context (per-request, auth-gated)

If authenticated:
- "You are talking to Carlos (logged in as `{name}`). Your user vault is {available|unavailable}; use `searchKnowledge` to consult personal notes when the question is about preferences, decisions, or private context."

If anonymous:
- "You are talking to a visitor. They don't have a personal vault. Keep answers grounded in the public knowledge graph and cite sources."

## Implementation changes

### New files

- `apps/chat/scripts/generate-agent-knowledge.ts` — build-time index generator.
- `apps/chat/lib/ai/knowledge/site-content.ts` — runtime loader + search + traverse helpers.
- `apps/chat/content/agent/identity.mdx` — hand-authored identity.
- `apps/chat/evals/identity.eval.ts`
- `apps/chat/evals/kg-retrieval.eval.ts`
- `apps/chat/evals/connectivity.eval.ts`

### Edited files

- `apps/chat/package.json` — add `generate:agent-knowledge` script, chain into `prebuild`.
- `apps/chat/vercel.json` — ensure `buildCommand` runs the new script.
- `apps/chat/next.config.ts` — add `outputFileTracingIncludes` for `public/agent-knowledge.json` so it ships with the serverless function.
- `apps/chat/lib/ai/prompts.ts` — rewrite: export `buildSystemPrompt({ session, chatId })` that assembles the 5 layers. Keep `systemPrompt()` as a deprecated thin wrapper for the transition commit only, then delete.
- `apps/chat/lib/ai/tools/knowledge-graph.ts` — replace `searchSiteContent()` (which only path-matches Lago manifests) with a body-aware variant reading from the new JSON. Add `traverseKnowledgeTool()`.
- `apps/chat/lib/ai/tools/tools.ts` and `tools-definitions.ts` — register `traverseKnowledge` in the tool registry and schema.
- `apps/chat/app/(chat)/api/chat/route.ts` — `getSystemPrompt()` now calls `buildSystemPrompt({ session, chatId })` and passes through project instructions when present.

### Unchanged

- `apps/chat/app/(site)/page.tsx` and `components/site/landing-sections.tsx` — hero input still redirects to `/chat?q=...`.
- `apps/chat/lib/ai/context-assembler.ts` — kept as-is for future use by other surfaces (e.g. the `/graph` page's search).
- `apps/chat/lib/ai/vault/*.ts` — Lago + local vault backends remain as they are.

## Data flow

```
Writer edits MDX
        │
        ▼
  git push → Vercel build
        │
        ▼
  prebuild hook
        ├── generate-search-index.ts    → public/search-index.json
        └── generate-agent-knowledge.ts  → public/agent-knowledge.json
                                             │
        ▼                                    ▼
  next build  ───────── bundled into Node function
        │
        ▼
  Deployed
        │
        ▼
  User lands on /chat or submits hero input
        │
        ▼
  /api/chat → buildSystemPrompt()
        │         ├── Layer 1: readFileSync(identity.mdx)  (cold-start cached)
        │         ├── Layer 2: getPinnedProjects / getLatest     (per request)
        │         ├── Layer 3: static string                      (cold-start cached)
        │         ├── Layer 4: static string                      (cold-start cached)
        │         └── Layer 5: session-based branch              (per request)
        │
        ▼
  Model receives prompt + tools
        │
        ▼
  If needed, calls searchKnowledge / readKnowledgeNote / traverseKnowledge
        │
        ▼
  loadAgentKnowledge() → cached parse of public/agent-knowledge.json
```

## Error handling & graceful degradation

- **Missing `public/agent-knowledge.json`** (dev without prebuild): `loadAgentKnowledge()` logs a single warning and returns an empty knowledge object. Search/read/traverse tools return `{ error: "Agent knowledge not built — run 'bun run generate:agent-knowledge'." }` with suggestions to run the build.
- **Corrupt JSON**: caught at parse; same empty-knowledge fallback, error logged once.
- **`identity.mdx` missing**: Layer 1 falls back to a minimal inline string ("I'm Arcan, the Broomva agent runtime.") so the chat still works. Warning logged once.
- **`VAULT_PATH` unset** (production): Layer 3 navigation text omits the "Local-only" subsection so the agent doesn't promise something it can't reach.
- **Lago unreachable**: user-vault search returns `[]`; the site-content source still answers. Existing behavior.

## Evals

Three new evals in `apps/chat/evals/`, using the existing eval harness:

### `identity.eval.ts`
Scenarios:
- "Who is Carlos?" → answer mentions AI engineer / agent architect, cites `/` or a writing post.
- "What is Broomva?" → mentions Life Agent OS, Arcan runtime, cites at least one project URL.
- "Who are you?" → first-person as Arcan, names the runtime lineage.

### `kg-retrieval.eval.ts`
Scenarios:
- "Tell me about the agent-native architecture essay" → calls `readKnowledgeNote` with slug `agent-native-architecture`, answer cites `/writing/agent-native-architecture`.
- "What prompts do you have for deep research?" → calls `searchKnowledge("deep research")`, surfaces `/prompts/deep-research-agent`.
- "What does the ecosystem-repo-architect prompt do?" → calls `readKnowledgeNote`, correct URL in citation.

### `connectivity.eval.ts`
Scenarios:
- "What's connected to the Life Agent OS?" → calls `traverseKnowledge` with seed `life-agent-os`, returns ≥ 3 neighbors with `hops` metadata.
- "Show me everything tagged agent-os" → calls `traverseKnowledge` with `edgeTypes: ["tag"]`, returns all tagged docs.

All three evals fail the build if accuracy drops below 80% on a fixed seed set.

## Testing strategy

- **Unit**: `lib/ai/knowledge/site-content.ts` — parse/search/traverse tested against a fixture JSON in `__fixtures__/`.
- **Integration**: a single Vitest that runs `generate-agent-knowledge.ts` against the real `content/` directory and asserts minimum document counts per kind.
- **Eval**: the three files above, run in CI via the existing eval command.
- **Manual smoke test**: start the app locally, open `/chat`, ask "What is Broomva?" — answer must include a pinned project URL, no hallucinations.

## Rollout

- Ship behind no flag. The new prompt is strictly additive (more grounding, same tools + one new tool). If the new build script fails, next build fails — no silent degradation.
- First deploy: merge, verify `public/agent-knowledge.json` lands in the built artifact, verify evals pass in CI, verify "What is Broomva?" cites a URL on production.
- Rollback: revert the commit; `systemPrompt()` wrapper (kept for one commit) guards the transition.

## Open questions

None at spec time. The `traverseKnowledge` tool is optional — if implementation pressure requires cutting scope, it can be moved to a follow-up PR without blocking the primary goal (identity + retrieval).

## Follow-ups (out of scope for this spec)

- Bridge `~/broomva/research/entities/` (the Knowledge Graph "Layer 3" from CLAUDE.md — permanent entity pages, not to be confused with this spec's "Layer 3" of the *system prompt*) into the agent via a committed snapshot step in `generate-agent-knowledge.ts`. Needs a cross-repo strategy.
- Add an `/api/agent-knowledge` debug endpoint that returns the loaded JSON (gated to authenticated admin users) for inspection.
- Consider chunk-embedding bodies and switching `searchKnowledge` to vector similarity once the corpus grows past ~500 documents.
- Broaden to other agents (Moltie for content, Haima for finance) once the Arcan pattern is proven.
