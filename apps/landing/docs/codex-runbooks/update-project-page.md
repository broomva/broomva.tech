# Runbook: Update project page

## Steps

1. Update the matching file under `content/projects/`.
2. Ensure sections include problem, approach, architecture, status, and impact.
3. Keep `status` and `links` accurate.
4. Run `bun run check:links` and `bun run build`.

## Acceptance criteria

- Project card still renders on `/projects`.
- Detail page renders with status and links.
- Internal and external links are valid.
