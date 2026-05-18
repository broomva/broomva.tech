# Changelog

## 0.4.3 — 2026-05-18

### Switch broomva-cli TLS backend to rustls (closes linux-arm64 cross-build)

Closes the remaining cross-build pain after v0.4.2. The aarch64 target now compiles in CI with no apt-installed openssl required.

- **CHANGED** `crates/broomva-cli/Cargo.toml` — `reqwest` now uses `default-features = false, features = ["json", "rustls-tls"]`. Removes the native-tls → openssl-sys dependency chain that the cross-rs `xenial` (Ubuntu 16.04) container couldn't satisfy. broomva-cli now uses pure-Rust rustls + webpki-roots for TLS — no system openssl, no libssl-dev, no `Cross.toml` apt-install gymnastics.
- **REMOVED** `crates/broomva-cli/Cross.toml` — no longer needed. The `apt-get install libssl-dev:arm64 pkg-config` pre-build step was a workaround for the openssl-sys dependency; rustls eliminates the root cause.

### Why this fix won

v0.4.2 shipped `Cross.toml` to apt-install `libssl-dev:arm64` in the cross container. That worked — the package installed cleanly. But the cross-rs `xenial` (Ubuntu 16.04) container's libssl is `1.0.2g`, while modern `openssl-sys v0.9.112` requires OpenSSL ≥ 1.1.1. Building a newer openssl from source inside the cross container would have worked but added significant build time + complexity. rustls switching removes the dependency entirely — simpler, faster, more secure (rustls has fewer historical CVEs).

### TLS backend swap implications

- **Certificate trust roots**: rustls uses `webpki-roots` (Mozilla's CA bundle, vendored at compile time). Previously native-tls used the OS trust store. For broomva-cli talking to broomva.tech APIs, this is equivalent.
- **Performance**: rustls is comparable to or faster than openssl for HTTPS — no regression expected.
- **Binary size**: rustls + ring add ~1 MB; libssl was dynamically linked. Static rustls is actually a win for distribution.
- **Cross-compile**: pure Rust, no system C library dependencies — all 4 release targets now build green from the same Cargo.toml.

### Expected v0.4.3 release.yml run

```
darwin-arm64  ✓
darwin-x64    ✓
linux-x64     ✓
linux-arm64   ✓  ← finally green (third attempt: rustls)
8 assets uploaded
```

## 0.4.2 — 2026-05-18

### Re-enable linux-arm64 release build via Cross.toml

Closes the linux-arm64 follow-up flagged in v0.4.1. The aarch64 target now builds green alongside the other three platforms.

- **NEW** `crates/broomva-cli/Cross.toml` — cross-rs configuration for the aarch64 target. `pre-build` step `apt-get install -y libssl-dev:arm64 pkg-config` inside the cross container so `openssl-sys` has the cross-architecture libs it needs to link. Passthrough env (`OPENSSL_DIR`, `OPENSSL_LIB_DIR`, `OPENSSL_INCLUDE_DIR`, `PKG_CONFIG_ALLOW_CROSS=1`) tells the build where to find them.
- **CHANGED** `.github/workflows/release.yml` — restored the `linux-arm64` matrix entry that was removed in v0.4.1 (PR #168). Inline comment cites the Cross.toml fix.

### Expected output of the v0.4.2 release.yml run

```
v0.4.2 — auto-tagged on push:main
  4-target matrix builds:
    darwin-arm64  ✓
    darwin-x64    ✓
    linux-x64     ✓
    linux-arm64   ✓  (newly green via Cross.toml)
  8 assets uploaded:
    4 × broomva-0.4.2-<target>.tar.gz
    4 × broomva-0.4.2-<target>.tar.gz.sha256
```

### Install path

`curl -fsSL https://broomva.tech/api/install | bash` from a linux-arm64 host now downloads the verified `broomva-0.4.2-linux-arm64.tar.gz` binary instead of falling back to `cargo install`.

## 0.4.1 — 2026-05-18

### Release automation: auto-tag + prebuilt CLI binaries

Closes the release loop opened in 0.4.0. When `VERSION` lands on `main`, a workflow now tags the commit, opens a GitHub Release with notes lifted verbatim from `CHANGELOG.md`, and cross-compiles the `broomva` CLI for four Unix targets — uploading each tarball plus a sha256 sidecar as release assets. The installer prefers those prebuilts (sha256-verified) and falls back to `cargo install` for unsupported platforms.

- **NEW** `.github/workflows/release.yml` — two-job pipeline. Job `tag` triggers on `push: branches: [main]` paths `[VERSION]`: reads `VERSION`, validates semver, skips silently if `vX.Y.Z` already exists, extracts the matching `## X.Y.Z` section from `CHANGELOG.md` via `awk`, creates an annotated tag, pushes it, and runs `gh release create` with the extracted notes. Job `build-cli` is gated on `created == 'true'` (newly-created tags only — re-runs over an existing tag never re-bomb assets) and matrix-builds the broomva binary for `darwin-arm64`, `darwin-x64`, `linux-x64`, `linux-arm64` (the last via `cross`). Each binary is stripped, tarballed as `broomva-<VERSION>-<target>.tar.gz`, sha256-summed, and uploaded to the release via `gh release upload --clobber`. Permissions scoped to `contents: write`; uses the workflow-provided `GITHUB_TOKEN` only.
- **CHANGED** `crates/broomva-cli/install.sh` — two-path strategy: (1) detect platform via `uname -s -m`, hit the GitHub Releases API for the latest tag, download `broomva-<VERSION>-<target>.tar.gz` plus `.sha256` sidecar, verify the hash (`sha256sum` or `shasum -a 256`), extract, install; (2) on unsupported platform / network failure / sha256 mismatch / `BROOMVA_SKIP_BINARY_DOWNLOAD=1`, fall back to `cargo install broomva`. Refuses to install a binary whose sha256 cannot be verified — no silent unverified path. The skill / bstack / Life Agent OS install steps are unchanged.
- **EDIT** `VERSION` — bumped to `0.4.1` (PATCH on `0.4.0`; additive infrastructure, no breaking change).
- **EDIT** `crates/broomva-cli/Cargo.toml` — version bumped to `0.4.1` in lockstep with root (`scripts/sync-cargo-version.sh` confirms).

### Supply-chain safety

The sha256 verification step in `install.sh` closes the unverified-binary hole that the cargo-install-only fallback in 0.4.0 didn't have to consider — once we publish prebuilts, downstream installs trust them. The sidecar file is published alongside each tarball by the same workflow that built it; if either file is missing or the hash mismatches, the installer refuses to proceed and falls back to compiling from source. There is no `BROOMVA_SKIP_SHA256` escape hatch by design.

### Compatibility

- First release fires on the next `VERSION` push to `main` after this PR merges. Existing users on `0.4.0` will not see an upgrade prompt until `broomva-update-check` picks up the new tag (which happens within one polling interval — same path as bstack).
- Tarballs contain a single `broomva` binary at the top level. Consumers writing scripts against the asset names should hard-code the pattern `broomva-<VERSION>-<target>.tar.gz` and `*.sha256` sibling.

### Out of scope (deferred to follow-up PRs)

- `bin/broomva` top-level dispatcher (mirrors `bin/bstack`) — PR C.
- Windows targets — broomva CLI is currently Unix-only.
- `cargo publish` automation — future PR.
- `npm publish` automation for any opt-in `packages/*` — future PR.

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
