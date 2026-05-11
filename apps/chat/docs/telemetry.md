# Prompt Telemetry — Phase 1 Reference

Tracks every prompt invocation across web, CLI, skill, and API sources.
This doc covers the data model, write/read paths, and how to query
locally. The full design lives at
`docs/superpowers/specs/2026-05-09-prompts-eval-engine-design.md`.

## Tables

- `PromptInvocation` — one row per prompt use (`source`, `caller`,
  `prompt_slug`, `prompt_version`, `user_id`, lifecycle status, model,
  tokens, cost). Indexed for time-series, source-breakdown, and
  per-user queries.
- `PromptFeedback` — explicit user signals (`thumbs_up` /
  `thumbs_down`, optional freeform `text`), optionally linked to an
  invocation via `invocationId`.

Both tables use the `prompt_invocation_source` enum
(`web | cli | skill | api`).

## Write paths

- `POST /api/invocations` — anonymous-OK, idempotent on `id`,
  rate-limited per IP. Used by CLI and skill.
- `PATCH /api/invocations/[id]` — completion update. Computes
  `cost_usd` server-side from `lib/prompts/pricing.ts`.
- `POST /api/feedback` — anonymous-OK, rate-limited.
- `POST /api/prompts/[slug]/copy` — existing endpoint, now also writes
  a `PromptInvocation` row with `source='web'`, `status='completed'`.

## Read paths

- `GET /api/metrics/overview?since=24h|7d|30d|all` — hero KPI strip.
- `GET /api/metrics/runs?prompt_slug=&source=&limit=&before=` — live
  runs feed (cursor pagination).
- `GET /api/metrics/volume?bucket=hour|day&since=24h|7d|30d` — volume
  timeseries.
- `GET /api/metrics/prompts/[slug]` — per-prompt strip.
- `GET /api/prompts?include=metrics&sort=skill_invokes|...` — list
  endpoint with per-prompt aggregates inline.
- `GET /api/feedback?prompt_slug=&limit=` — recent feedback rows.

## Local query examples

Run with `bun -e '...'` or via `bun db:studio`.

```sql
-- Top 10 prompts by skill invokes in the last 7 days
SELECT "promptSlug", COUNT(*) AS n
FROM "PromptInvocation"
WHERE source = 'skill' AND "createdAt" >= now() - interval '7 days'
GROUP BY "promptSlug"
ORDER BY n DESC
LIMIT 10;

-- Abandonment rate per source (pulled but never completed after 24h)
SELECT source, COUNT(*) FILTER (WHERE status = 'abandoned') * 1.0 / COUNT(*) AS rate
FROM "PromptInvocation"
WHERE "createdAt" >= now() - interval '7 days'
GROUP BY source;

-- Cost-per-source last 24h
SELECT source, SUM("costUsd") AS usd
FROM "PromptInvocation"
WHERE "completedAt" >= now() - interval '24 hours'
GROUP BY source;
```

## Privacy

- IPs are SHA-256 hashed with a daily salt; raw IPs never hit disk.
- Variable values are SHA-256-truncated by default. Raw values stored
  only when caller is admin AND request includes `?raw_vars=1`.
- The PostHog event `prompt_copied` from the legacy `/copy` route is
  preserved alongside the new table for backwards compat.
