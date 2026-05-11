---
name: broomva-cli
description: >
  Reference for the `broomva` Rust CLI — manage prompts, skills, and context
  from the terminal or Claude Code sessions. Includes the auto-tracing
  protocol that turns this skill into the runtime dispatcher for
  broomva.tech/prompts. When a user asks to "use the X prompt", "run the X
  prompt as instructions", or "pull X prompt", this skill is the answer.
triggers:
  - broomva cli
  - broomva prompts
  - use the X prompt
  - run the X prompt as instructions
  - pull the X prompt
  - push prompt
  - pull prompt
---

# broomva — CLI Quick Reference

Rust CLI at `~/.cargo/bin/broomva`, source at `crates/broomva-cli/` in the
broomva.tech monorepo. Talks to `broomva.tech/api/*` (Phase 1 telemetry +
existing prompts/skills/context endpoints).

## Standard commands

```bash
broomva prompts list [--mine] [--category X] [--metrics] [--sort skill_invokes]
broomva prompts get <slug> [--raw|--json]
broomva prompts pull <slug> [-o file.md] [--json]
broomva prompts push file.md [--create]
broomva skills list [--layer X]
broomva context conventions
broomva auth status
```

## Running prompts (auto-traced)

**This is the contract that turns every prompt invocation into a typed
row server-side.** Follow these five steps when the user asks for a
prompt, or when you invoke a prompt as instructions during a task.

1. **Set the source flag once per session:**
   ```bash
   export BROOMVA_SOURCE=skill
   ```

2. **Pull the prompt:**
   ```bash
   broomva prompts pull <slug> --json 2>&1 | tee /tmp/broomva-last.json
   ```
   The CLI writes the prompt to `<slug>.md` (or `-o path`) and emits a
   JSON line on stderr: `{invocation_id, prompt_slug, prompt_version, posted}`.

3. **Use the prompt body** in your reply / as the system instructions
   for the work the user asked you to do.

4. **MANDATORY: After completing the work the prompt asked for, call:**
   ```bash
   broomva prompts complete <invocation_id> \
     --status completed \
     --model <your-model-name> \
     --latency-ms <wall-clock-ms> \
     --tokens-in <input-tokens> \
     --tokens-out <output-tokens>
   ```
   Use `--status failed` if the work could not be completed and include
   `--error-message`. **This is how prompts get evaluated.** Skipping it
   breaks the feedback loop.

5. **Optional: capture explicit feedback** if the user gave a clear
   thumbs up/down:
   ```bash
   broomva prompts feedback <invocation_id> --slug <slug> --signal up --text "user's words"
   ```

## Environment

| Var | Purpose |
|---|---|
| `BROOMVA_TOKEN` | Auth (Bearer) — get from `https://broomva.tech/api/auth/api-token` |
| `BROOMVA_SOURCE` | `cli` (default) / `skill` / `api`. Sets `source` on every invocation row. |
| `BROOMVA_TELEMETRY_DISABLED=1` | Opt out — no rows are written. |
| `BROOMVA_TELEMETRY_RAW_VARS=1` | Admin-only: send raw variable values instead of hashed. |
| `BROOMVA_API_BASE` | Override API host (default `https://broomva.tech`). |
| `BROOMVA_SESSION_PATH` | Override session-id cache path (default `~/.broomva/session`). Used by tests. |

## API routes the CLI talks to

- `GET /api/prompts[?include=metrics&sort=...]` — list (Phase 2 `?include=metrics`)
- `GET /api/prompts/:slug[?include=metrics]` — get
- `POST /api/prompts` — create (auth required)
- `PUT /api/prompts/:slug` — update (auth required)
- `DELETE /api/prompts/:slug` — delete (auth required)
- `POST /api/invocations` — telemetry beacon (anonymous-OK, rate-limited per IP/user)
- `PATCH /api/invocations/:id` — completion update (anonymous-OK if row has no user_id)
- `POST /api/feedback` — explicit user signal (anonymous-OK)
- `GET /api/feedback?prompt_slug=...&limit=...` — recent feedback
- `GET /api/metrics/overview?since=24h|7d|30d|all` — hero KPI strip
- `GET /api/metrics/runs?prompt_slug=&source=&limit=&before=` — paginated runs
- `GET /api/metrics/volume?bucket=hour|day&since=24h|7d|30d` — timeseries
- `GET /api/metrics/prompts/:slug` — per-prompt strip
- `GET /api/skills` / `GET /api/skills/:slug` — skills roster
- `GET /api/context` — project context + conventions

## Auth

Token resolution order: `--token` flag > `BROOMVA_TOKEN` env > `~/.broomva/config.json`.
Run `broomva auth login` for the device-code flow, or `broomva auth login --manual` to paste a token.

## Source attribution

When this skill invokes the CLI inside Claude Code, it sets
`BROOMVA_SOURCE=skill` before the pull, so the row carries
`source='skill'` server-side. Terminal users default to `cli`.
Programmatic callers wrapping the CLI should set `BROOMVA_SOURCE=api`.
