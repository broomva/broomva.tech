---
name: broomva-cli
description: >
  Reference for the @broomva/cli package — manage prompts, skills, and context
  from the terminal or Claude Code sessions.
triggers:
  - broomva cli
  - broomva prompts
  - push prompt
  - pull prompt
---

# @broomva/cli — Quick Reference

The CLI lives at `packages/cli/` in the monorepo. Full docs: `packages/cli/SKILL.md`.

## Key Commands

```bash
broomva prompts list [--mine] [--category X] [--json]
broomva prompts get <slug> [--raw|--json]
broomva prompts pull <slug> [-o file.md]
broomva prompts push file.md [--create]
broomva skills list [--layer X]
broomva context conventions
```

## API Routes (this app)

- `GET /api/prompts` — list prompts
- `GET /api/prompts/:slug` — get prompt
- `POST /api/prompts` — create (auth required)
- `PUT /api/prompts/:slug` — update (auth required)
- `DELETE /api/prompts/:slug` — delete (auth required)
- `GET /api/skills` — list skills roster
- `GET /api/skills/:slug` — get skill detail
- `GET /api/context` — project context + conventions

## Auth

Bearer tokens from `/api/auth/api-token`. Resolution: `--token` > `BROOMVA_API_TOKEN` env > `~/.broomva/config.json`.
