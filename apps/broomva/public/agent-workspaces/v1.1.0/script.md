# The workspace is the product: speaker script

A living keynote for technical peers on the operating context for agent work. It has 37 scenes: 30 substantive scenes plus seven act breakers, in seven acts. It runs about 47 minutes; see "Cutting to about 43 minutes" below.
The deck is `deck/index.html` plus a `deck/fonts/` folder. It has no network dependencies and no build step.
The same notes appear in the deck (`N`, a glass side panel) and in presenter view (`P`).

## Running it

- Open `deck/index.html` in Chromium or Safari. `F` toggles fullscreen.
- `→` / `Space` advance a beat, then a scene. `←` goes back. `Home` / `End` jump.
- `L` opens the scene ledger (a glass side panel). Click any row to jump there.
- `N` opens the notes panel. `Esc` closes both panels.
- `P` opens presenter view in a second window: the live scene, notes, what comes next, a timer and the clock. The two windows stay in sync over a `BroadcastChannel`.
- `T` switches Dark ↔ Day Glass.
- `M` freezes motion. The OS "reduce motion" setting does the same on load. The OS "reduce transparency" setting makes glass solid.
- Deep links: `#scene=12&beat=2&day` opens scene 12 at beat 2 in Day Glass. Legacy `#12.2` still works.

## Talk track

Numbers match the deck counter and `#scene=` links. The beats in brackets are the `→` presses inside a scene.

| # | Scene | Time | Say |
|---|---|---|---|
| 1 | The workspace is the product | 1:00 | Models are rented and harnesses converge. The place they work in is what compounds. |
| 2 | Give the agent a filesystem and a shell [2] | 2:00 | Chat-only claims drift and dissolve. With files and bash, the agent reads, runs and writes back, and its answers leave with citations. |
| 3 | Seven questions. One system. | 1:00 | Seven questions, in order. One thread runs through every tile. |
| 4 | Act I · Workspaces (breaker) | 0:20 | Let the ASCII piece run while you frame the act in one sentence. |
| 5 | A folder is not a workspace [2] | 1:30 | Sessions climb while retained knowledge stays at zero. Then the same agents dock into rings and leave deposits in memory. |
| 6 | Six layers an agent reads before it writes [2] | 1:30 | Fan the stack out and hover the plates. Read top-down, write bottom-up. |
| 7 | Sandbox, harness, wire [4] | 1:30 | Buy the box, swap the brain. The MCP + CLI rail never moves. Keep the wire thin. |
| 8 | Medallion layers live in the filesystem [2] | 1:30 | Bronze, silver and gold are folders inside each workspace. Many workspaces write to one ledger. |
| 9 | Worked example: a review system [4] | 2:00 | Architecture only. One sandbox per case. Reader subagents produce quoted claims. Code verifies and judges. A shared ledger is the system of record. |
| 10 | Act II · Context (breaker) | 0:20 | Let the ASCII piece run while you frame the act in one sentence. |
| 11 | How an agent's context is built [2] | 2:00 | Bare session vs workspace session. Hover the layers: each has a source on disk, a load moment and a budget. The proportions are illustrative. |
| 12 | Hooks turn recall into a reflex [5] | 2:00 | Primer asks, skills know how, hooks run every time. Walk the five stations. The real intake hook injects the lens, the constraints and the entities into every prompt. |
| 13 | Files first. Vectors when words diverge. [4] | 1:30 | The query fans out to every retriever. Local first. Embeddings when vocabulary diverges. Live data through MCP and APIs. |
| 14 | Act III · Second brain (breaker) | 0:20 | Let the ASCII piece run while you frame the act in one sentence. |
| 15 | Most second brains are write-only [2] | 1:30 | 0.9% of 565 sessions loaded the graph in the week measured. Wire recall into intake, and prune writers when reads lag. |
| 16 | Front matter is the API [4] | 1:30 | The folder is the first index. Front matter compiles into the catalog. `related:` becomes edges and `aliases:` become synonyms. |
| 17 | An entity is a claim with receipts [5] | 1:30 | One real entity and its related-neighbour graph. Hover the nodes. |
| 18 | The loop that makes knowledge readable [6] | 1:30 | Capture, score, link, index, load, act. Close on the footnote: memory is about the owner, the graph is about the world, the ledger is about what's in flight. |
| 19 | Insight hardens into mechanism [5] | 2:00 | From observation to memory fact, entity, skill, then hook, policy or test. Promote on the third instance. Prose persuades; executables enforce. |
| 20 | Act IV · Skills (breaker) | 0:20 | Let the ASCII piece run while you frame the act in one sentence. |
| 21 | A skill is a procedure, not a prompt | 1:00 | The description is the router; bodies load only when triggered. |
| 22 | Skill, CLI, MCP [4] | 1:00 | One knows, one does, one reaches. |
| 23 | Author once. Fan out. Ration hard. [2] | 1:30 | 31 harness folders; at 457 installed skills, 26 kept their descriptions. |
| 24 | Act V · Structure (breaker) | 0:20 | Let the ASCII piece run while you frame the act in one sentence. |
| 25 | One place, many repos [3] | 1:00 | Governance shared, products sovereign, worktrees disposable: one beat each. |
| 26 | One writer per tree | 1:00 | Lanes merge through review or bounce back; the janitor sweeps. |
| 27 | Act VI · Fleets (breaker) | 0:20 | Let the ASCII piece run while you frame the act in one sentence. |
| 28 | Roles, not agents [6] | 2:00 | Owner, meta-orchestrator, orchestrator, worker, reviewer, sensor, and what each must never do. Today's fleet runs as T3 threads and delegated child tasks; earlier Paseo sessions are history. |
| 29 | Spawn, reuse, or hand off [5] | 1:30 | Four questions route a live task: spawn, keep, brief, ask. Then the field of 838 sessions: the 158 past 400K tokens carried 87% of the token cost (API-equivalent). |
| 30 | Governance that scales with the fleet [4] | 1:30 | One pipeline, four principles: pace from measured capacity, review the writer can't skip, an executable policy gate, sensors that file tickets. |
| 31 | Act VII · Leadership (breaker) | 0:20 | Let the ASCII piece run while you frame the act in one sentence. |
| 32 | The unit of work is now a loop [2] | 1:30 | A task waits; a loop iterates. Scarcity moves from making to deciding. |
| 33 | Everyone leads a fleet [5] | 2:00 | Intent, bounds, evidence, escalation and review. Each term adds a force to one fleet and keeps acting: flow, a wall and a red zone, receipts into your ledger, an ask you answer, a different judge before the gold line. |
| 34 | Attention is the new ration [2] | 1:30 | Reversible, costly, irreversible. "It's how precisely it calls you." |
| 35 | Goalposts teach waiting. Bars rise in the open. [2] | 1:30 | A goalpost moves behind frosted glass after the team arrives, and the team stalls. A bar written on a shared, queryable wall rises in logged steps, and the team keeps climbing. |
| 36 | Better agents come from better harnesses [6] | 1:30 | Layer by layer around the same model: loop, docked tools, context shell, guard rim, scanning evals, the workspace lattice that keeps deposits. The outcome meter is illustrative. |
| 37 | Twenty primitives. One loop. [2] | 1:00 | Twenty beads on one loop in five phases; a light passes each. Then the loop folds into the orb: three takeaways and the thesis. |

### Cutting to about 43 minutes

Skip 6 (anatomy), 21–22 (skill anatomy, and skill vs CLI vs MCP), and 26 (one writer per tree). That saves 4.5 minutes, from 47:20 to 42:50. The ledger (`L`) makes skipping visible and painless.

## Sources

The following are dated author-workspace observations and illustrative source paths. Those private workspace files are not distributed here, and these numbers are not independently reproducible from this repository. See [resources.md](resources.md) for public primary sources and installation instructions.


| Figure or content | Source | As of |
|---|---|---|
| 0.9% of 565 sessions loaded the graph | Session-start self-improvement telemetry (`kg_load_rate` 0.0088 over 7 days) | 2026-10-26 |
| 1,430 entities · 6,076 edges | `docs/knowledge-index.md` header | 2026-10-25 |
| Entity graph (scene 17) | Related-neighbour traversal `[[link]]` neighbourhood of `agent-harness-three-layer-split` (concept, pattern and tool types only; slugs only) | 2026-10-26 |
| Front-matter fields and `/kg load` flags (scenes 16, 13) | `skills/knowledge/kg/SKILL.md`; entity front matter in `research/entities/` | 2026-10-26 |
| Hook stations and their jobs (scene 12) | `.claude/settings.json` registrations (SessionStart ×5, UserPromptSubmit, PreToolUse on Bash/Write/Edit, Stop); plugin and user-level hooks add more (the bstack plugin's SessionStart hook injects the board facts and the self-improvement metric) | 2026-10-26 |
| 115 authored skills · 23 categories · 31 harness folders | `skills/skills/**/SKILL.md`; dot-directories containing `skills/` | 2026-10-26 |
| 66 product repos (scene 25) | git repositories under `apps/` (42 direct children), `core/` (13 direct children) and `work/` (11, one or two levels down) | 2026-10-27 |
| Catalog ~260K tokens at 1,430 entities (scene 13) | `docs/knowledge-index.md` is 1,026,411 bytes | 2026-10-27 |
| Lanes on green (scene 30) | `CONCURRENCY` in the capacity governor (five in the configured non-Claude green fallback; actual limits depend on provider and meta setpoints); setpoints are adjusted from measured usage | 2026-10-27 |
| 457 installed → 26 descriptions | Roster measurement in owner memory (`skill-biases-a-tool-binds`) | 2026-08-23 |
| 158 of 838 sessions > 400K carry 87% of token cost (API-equivalent) | 30-day transcript cost analysis (BRO-3067, workspace #983) | 2026-10-10 |
| Worked example (scene 9) | A trial review system's architecture decisions on medallion-in-filesystem with a Postgres system of record, and on harness-driven review; patterns only, no client, case or data | 2026-10-26 |
| Leadership act (32–35) | *The New Dynamics of Agentic Leadership* (X article by broomva_tech), plus the workspace decision and continuation protocols | 2026-10-25 |

The context-window proportions on scene 11 are illustrative and labelled that way on screen.

## Design decisions

- **Aesthetic.** This follows the living-diagram pages. Diagrams are painted continuously on a DPR-aware canvas from one `requestAnimationFrame` loop, with `dt` clamped to 0.033 s. Connections are cubic béziers drawn as multi-strand ribbons with gradients. Edge particles `{u,v}` fade with `sin(πu)` and recycle at `u ≥ 1`. Marching dashes are kept for the active route only. Focus dims non-neighbours, and hover inspectors use glass tooltips.
- **Motion.** One `Sp` spring class (response and damping ratio, critically damped by default) drives scene presence, staggered reveals, segmented-control thumbs, the progress bar and side panels. None of these use CSS transitions. Springs start from the live value, so every change can be interrupted.
- **Glass.** Glass sits only on surfaces that float above live diagrams or chrome: `blur(24px) saturate(190%)`, an inset rim, a pointer-tracked specular highlight and a rim mask. Side panels materialize, with blur, saturation and opacity springing together. Honours `prefers-reduced-transparency` and `prefers-contrast`.
- **Colour.** The roles come from the living pages: one brand accent for flow, a structure colour, particles at about 80% alpha, and gold only for proven, built or ledgered paths. The values are an Apple Midnight blue axis (hue ~250, no purple cast), with green, amber and red kept for outcomes.
- **Type.** Raleway (light) for titles, Inter for UI, JetBrains Mono for paths and commands. These are vendored under `fonts/` (OFL) so the deck runs offline.
- **Stage.** A fixed 1920×1080 stage is scaled to fit. Only the live scene's canvas holds a backing store; other canvases are released after each transition. With reduced motion, every scene draws one complete still frame.
