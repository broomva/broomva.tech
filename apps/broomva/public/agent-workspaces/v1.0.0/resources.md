# Public resources and a starting path

Agent Workspaces — The workspace is the product, by Broomva (2026). Authored talk, guide, script and this resource list: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Attribute the title and Broomva, link the license, and identify changes. Authored renderer/tooling: [Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0). Fonts: SIL OFL 1.1; full texts accompany `deck/fonts/`. Third-party material remains under its own terms.

The links below are public primary sources, retrieved 2026-10-27. Their contents and commands can evolve. This package does not install skills, configure hooks or supply the author's private knowledge graph. Local paths and numerical measurements in the deck/script are dated **workspace examples**, not distributed files. Commands that scaffold governance should run in a workspace you control after reading their current help.

## 1. Start with files and a bounded task

Put a short primer at your repository root, record the intended outcome, constrain writes and require evidence from files or command results. Use the [AGENTS.md convention](https://agents.md/) and [Claude Code memory documentation](https://code.claude.com/docs/en/memory) to understand which instructions your harness actually loads. [Anthropic's context-engineering guidance](https://www.anthropic.com/research/effective-context-engineering-for-ai-agents) explains why selecting context matters. Use [ripgrep](https://github.com/BurntSushi/ripgrep) for exact local search.

## 2. Install public procedures selectively

The [broomva/skills repository](https://github.com/broomva/skills) publishes procedures as `SKILL.md` packages. Inspect a skill before installing it into your agent's configured skills directory. For example:

```sh
npx skills add broomva/skills --skill kg
npx skills add broomva/skills --skill p9
```

These are companion procedures, not a copy of the author's workspace. Follow your harness's skill-loading mechanism; a skill being present does not prove that its hooks or commands execute. The [Agent Skills specification](https://agentskills.io/specification) and [Claude Code skills documentation](https://code.claude.com/docs/en/skills) describe the package and loading contract.

## 3. Add governance deliberately with bstack

[bstack](https://github.com/broomva/bstack) is a CLI and governance substrate with scripts, schemas, templates and a companion-skill roster. Its [current README](https://github.com/broomva/bstack/blob/main/README.md) instructs users to clone the full repository:

```sh
git clone https://github.com/broomva/bstack.git
cd bstack
./bin/bstack bootstrap
```

Bootstrap scaffolds governance and wires supported hooks. Review its output and configuration in your target workspace; installation alone is not evidence of enforcement. For the procedures-only primer, the README offers `npx skills add broomva/skills --skill bstack`. That skill install does not replace the CLI checkout.

## 4. Use p9 to own an external wait

The [public p9 procedure](https://github.com/broomva/skills/blob/main/skills/orchestration/p9/SKILL.md) documents `p9 host`, `p9 watch <pr>` and `p9 wait-for <name> --cmd '<predicate>'`. Read the procedure's setup and host-specific return path first. Prefer an app-owned PR watcher when your harness exposes one. Attach one watcher, continue useful independent work, and collect terminal evidence; background completion notifications depend on the host. A procedure install does not itself create a `p9` executable or authorize a merge.

## 5. Grow a graph you can actually read

The [public KG procedure and loader](https://github.com/broomva/skills/tree/main/skills/knowledge/kg) route a local Markdown knowledge base through a generated catalog. Start with your own cited entities and a catalog; this repository includes neither the author's entity files nor its private index. After setting up the documented substrate, ask your agent to use:

```text
/kg load agent workspaces --terms "context,recall,harness" --n 5
/kg load agent workspaces --expand 1 --explain
```

The catalog selects candidate entities; the agent reads the selected bodies and follows related neighbours. Expansion is bounded by the loader's current implementation, not a guarantee of a fixed-depth view of the entire graph. [Bookkeeping](https://github.com/broomva/skills/tree/main/skills/knowledge/bookkeeping) supplies the capture, scoring and index workflow; read its requirements before creating an index. Measure reads as well as writes. Add semantic retrieval when vocabulary diverges or the catalog can no longer serve as the routing context; entity bodies can already exceed the context window.

## 6. Verify the harness and tool boundary

[Claude Code hooks](https://code.claude.com/docs/en/hooks) document lifecycle events and their actual enforcement surface. [Model Context Protocol](https://modelcontextprotocol.io/docs/getting-started/intro) specifies tool/context connections. These are separate from the skill's procedure and the CLI that executes work. Confirm host support before copying a workspace configuration. The talk's fleet capacities and orchestration choices are examples, not provider limits.

## 7. Reproduce this presentation

[Bun installation](https://bun.sh/docs/installation) and [Playwright browser installation](https://playwright.dev/docs/browsers) cover the package prerequisites. Use this repository's pinned lockfile and the README's check/build commands. The offline HTML is the canonical presentation; the slide PDF and reader guide are generated from its final frames.
