# Runbook: Write a long post

## Steps

1. Pick a topic from `docs/content-pillars.md`.
2. Create `content/writing/<slug>.mdx` from `docs/post-templates/longform.mdx`.
3. Include problem, approach, tradeoffs, and implementation notes.
4. Verify all links.
5. Run `bun run check:links` and `bun run build`.

## Acceptance criteria

- Post has clear thesis and operational detail.
- Appears in `/writing` and homepage latest writing section.
- Build and link checks pass.
