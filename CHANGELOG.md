# Changelog

## 0.4.0 — 2026-05-18

### Release infrastructure

First formally-released version. Establishes the OSS release pipeline foundation that every subsequent release builds on. Mirrors the pattern bstack shipped in its v0.2.2 release.

- **NEW** `CONTRIBUTING.md` — contribution guide: branch + PR shape, Conventional Commits, workspace layout, local validation steps, conventions for adding apps/packages/crates.
- **NEW** `RELEASE.md` — semver policy (pre-1.0: minor = potentially breaking), release checklist, retroactive-tag rationale, cadence guidance, update-check transport docs, multi-surface coordination (website / CLI binary / Cargo crate / npm packages), pipeline expansion roadmap.
- **NEW** `CHANGELOG.md` — one section per release, prepended on each version bump. `validate-release.yml` enforces `## X.Y.Z` alignment with `VERSION` on PR.
- **NEW** `.github/workflows/validate-release.yml` — PR gate. When `VERSION` changes, asserts (1) the new value is semver `X.Y.Z`, (2) `CHANGELOG.md` has a matching `## X.Y.Z` section, (3) `VERSION` monotonically increases, (4) `crates/broomva-cli/Cargo.toml` is in lockstep via `scripts/sync-cargo-version.sh --check`. No-op on PRs that don't touch `VERSION`.
- **NEW** `scripts/sync-cargo-version.sh` — keeps `crates/broomva-cli/Cargo.toml` in lockstep with the root `VERSION`. Two modes: default (rewrite Cargo.toml to match), `--check` (CI mode, exit non-zero on drift). Idempotent.
- **CHANGED** `bin/broomva-update-check` — primary source is now the GitHub Releases API (`/repos/broomva/broomva.tech/releases/latest`), with raw `VERSION` on `main` as fallback. **This means dev-branch VERSION bumps no longer leak to downstream installs as "available upgrades"** — only tagged releases do. Two new env vars: `BROOMVA_RELEASES_URL` (primary), `BROOMVA_REMOTE_URL` (fallback, unchanged behavior). Gracefully degrades to the fallback while no GitHub Releases exist yet.
- **EDIT** `VERSION` — reconciled to `0.4.0`. Previously: `VERSION=0.1.0` at root, `version="0.3.0"` in `crates/broomva-cli/Cargo.toml`, no GitHub Releases, no git tags. The 0.1.x and 0.3.x ranges were development-only and never reached a downstream consumer; 0.4.0 is the first formally-released version.
- **EDIT** `crates/broomva-cli/Cargo.toml` — version bumped to `0.4.0` to match root.

### Migration

None required for existing downstream consumers — there were no prior formal releases. CLI users running `cargo install broomva` or pulling the install script today get a build-from-source path; nothing in their workflow changes. The first GitHub Release (v0.4.0) gives `broomva-update-check` an anchor; without it the transport falls back to raw `VERSION` on `main`, preserving the prior behavior.

### Out of scope (deferred to follow-up PRs)

- `.github/workflows/release.yml` for auto-tag-on-merge — separate PR.
- CLI binary cross-compile + upload to release artifacts — separate PR.
- `bin/broomva` top-level dispatcher (mirrors `bin/bstack`) — separate PR.
- `cargo publish` automation — future PR.
- `npm publish` automation for any opt-in `packages/*` — future PR.

The release contract shipped here is the foundation those PRs compose on top of.
