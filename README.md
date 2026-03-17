# broomva.tech monorepo

Turbo monorepo with:

- `apps/landing`: personal site and content hub
- `apps/chat`: full ChatJS app (interactive chat runtime)

## Workspace commands

```sh
bun install
bun run dev
```

Run both apps in parallel:

```sh
bun run dev:all
```

`dev:all` requires `apps/chat/.env.local` to be configured.

Target a single app:

```sh
bun run dev:landing
bun run dev:chat
```

Landing app build, lint, test:

```sh
bun run build
bun run lint
bun run test
```

Chat app specific:

```sh
bun run build:chat
bun run lint:chat
bun run test:chat
bun run test:types
```

Landing checks:

```sh
bun run check:links
bun run check:links:external
```
