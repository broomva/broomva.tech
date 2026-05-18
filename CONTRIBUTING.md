# Contributing to broomva.tech

Thanks for opening a PR. broomva.tech is the monorepo for the broomva.tech site, the `broomva` CLI, supporting packages, and the public design system. Releases ship to multiple downstream surfaces (Vercel, GitHub Releases, crates.io, npm) — the contribution rules below exist to keep those propagations reliable.

## Branch + PR shape

- **Branch names**: `feat/<slug>`, `fix/<slug>`, `chore/<slug>`, `docs/<slug>`, `refactor/<slug>`, `test/<slug>`.
- **PR title**: Conventional Commits format (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`, `perf:`). Scope is encouraged (`feat(cli): ...`, `fix(broomva-app): ...`, `chore(release): ...`). See `git log --oneline` for examples.
- **One concern per PR**. Mixing release infrastructure with a new feature makes both harder to revert.
- **Squash on merge**. Linear history.

## Commit messages

Conventional Commits, body explains the *why*. Existing commits are the reference:

```
feat(agent-session): multi-turn streaming contract (Plan E-2)
feat(release): formalize OSS release infrastructure (0.4.0)
fix(broomva-app): probe public asset routes against production
```

## Workspace layout

```
broomva.tech/
├── VERSION                       # ← canonical source of truth (semver X.Y.Z)
├── CHANGELOG.md                  # ← one section per release
├── apps/
│   ├── broomva/                  # Main Next.js 16 site (Bun + Turborepo)
│   ├── console/                  # Agent-OS console route group
│   └── docs/                     # Docs site
├── crates/
│   └── broomva-cli/              # `broomva` Rust CLI (mirrors root VERSION)
├── packages/                     # Internal TypeScript packages
├── bin/                          # Shell utilities (update-check, config)
├── scripts/                      # Repo-level scripts (sync-cargo-version, platform-setup)
└── .github/workflows/            # CI + release pipeline
```

## Local validation (before pushing)

```bash
bun install --frozen-lockfile
bun run lint
bun run test:types
bun run check:links
bun run check:content
bun run check:public-asset-routes      # hits real production URLs without auth headers

# Shell + release-infra hygiene
shellcheck --exclude=SC1091,SC2155,SC2034 bin/* scripts/*.sh
bash scripts/sync-cargo-version.sh --check    # VERSION ↔ Cargo.toml lockstep

# CLI smoke
cargo check -p broomva
```

CI runs the same checks via `.github/workflows/ci.yml` and `.github/workflows/validate-release.yml`.

## Adding a new app or package

The workspace is a Turborepo. New apps live under `apps/`, new packages under `packages/`, new Rust crates under `crates/`.

1. Create the directory with its own `package.json` (or `Cargo.toml`).
2. Wire it into `turbo.json` if it has a `build` / `lint` / `test:types` task that should run in CI.
3. If it's user-facing or shipped on its own, document it in `README.md` and decide whether it gets its own version cadence. Today the only Rust crate (`broomva-cli`) tracks the root VERSION; that's the convention to follow if you add another shipping unit.
4. For npm packages intended for publish, set `"private": false` and a stable `name` namespace before opening the PR — naming things later forces a major version bump.

## Testing locally

```bash
bun run dev                                # apps/broomva on http://localhost:3001
turbo run lint typecheck test --filter=...  # turborepo-scoped runs
cargo test -p broomva                       # CLI tests
```

The `check:public-asset-routes` script probes the live broomva.tech production URL to catch auth-gating regressions before merge — it is a real network call and may fail offline; gate it behind `TARGET_BASE_URL` for local-only runs.

## Release

See `RELEASE.md`. Short version:

1. Bump root `VERSION`.
2. Run `bash scripts/sync-cargo-version.sh` so `crates/broomva-cli/Cargo.toml` matches.
3. Prepend a section to `CHANGELOG.md` matching the new version.
4. `validate-release.yml` confirms VERSION + CHANGELOG + Cargo.toml are aligned on the PR.
5. After merge, tag and create the GitHub Release (see `RELEASE.md` for the full sequence).

## Style

- **TypeScript**: Biome (never ESLint/Prettier). Strict mode. Bun for new workspaces.
- **Rust**: `cargo fmt` + `cargo clippy -- -D warnings`. Edition 2024.
- **Shell**: `set -euo pipefail`, quote variables, `shellcheck`-clean (excludes documented in `.github/workflows/ci.yml`).
- **Markdown**: Long-form human-readable docs (RELEASE.md, CONTRIBUTING.md) can be prose-heavy; agent-readable surfaces (AGENTS.md, CLAUDE.md) stay terse.

## Questions

Open a discussion in the repo or ping in the workspace channel where broomva.tech is being used. PRs without context get bounced — paste the failure mode, the proposed fix, and the validation you ran.
