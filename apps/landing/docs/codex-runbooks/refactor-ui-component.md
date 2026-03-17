# Runbook: Refactor UI component

## Steps

1. Define the component goal and affected routes.
2. Make focused edits in `app/components/` and related pages.
3. Preserve responsive behavior and accessibility.
4. Avoid introducing dead links or broken routes.
5. Run `bun run lint`, `bun run check:links`, and `bun run build`.

## Acceptance criteria

- Visual behavior remains consistent on desktop and mobile.
- No regressions in route navigation.
- Lint and build pass.
