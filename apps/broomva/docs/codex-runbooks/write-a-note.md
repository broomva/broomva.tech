# Runbook: Write a note

## Steps

1. Choose one idea from `docs/content-pillars.md`.
2. Create a new file in `content/notes/` using `docs/post-templates/note.mdx`.
3. Keep body length short and focused on one practical point.
4. Add links only if verified.
5. Run `bun run check:links` and `bun run build`.

## Acceptance criteria

- Frontmatter is complete and valid.
- Note renders in `/notes` and on the homepage latest section.
- No broken internal links.
