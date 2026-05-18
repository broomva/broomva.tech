# Release process

broomva.tech ships **four downstream surfaces** from a single source repo:

| Surface | Cadence | Source of truth |
|---|---|---|
| **Website** (`broomva.tech`) | Auto-deploy on push to `main` (Vercel) | Whatever's in `apps/broomva/` at the moment of merge |
| **`broomva` CLI binary** | Tagged release (`vX.Y.Z`) | Root `VERSION` ↔ `crates/broomva-cli/Cargo.toml` |
| **`broomva` Cargo crate** | Tagged release (publish step, future) | `crates/broomva-cli/Cargo.toml` version |
| **npm packages** (`packages/*` with `"private": false`) | Tagged release (publish step, future) | Per-package `package.json` version, currently uniform with root |

The release infrastructure shipped in **0.4.0** establishes the contract; auto-tag-on-merge + binary artifacts + crate publish + npm publish are layered on top in subsequent releases (see "Pipeline expansion roadmap" below).

## Versioning policy (Semantic Versioning)

broomva.tech follows [SemVer 2.0](https://semver.org/) with the **pre-1.0 convention** that minor versions may carry breaking behavior changes:

| Pre-1.0 (`0.x.y`) | Meaning |
|---|---|
| `0.x.0` (minor) | New apps/packages/CLI commands shipped, behavior-changing default flips, schema changes to public types. **May break downstream consumers** — document migrations in CHANGELOG. |
| `0.x.y` (patch) | Bug fixes, doc updates, additive non-default features, CLI flag additions, dependency bumps. Safe to auto-upgrade. |

Once 1.0.0 ships, the standard SemVer rules apply (major = breaking, minor = additive backwards-compatible, patch = fixes only).

### Examples

| Change | Bump |
|---|---|
| New CLI subcommand `broomva deploy` | **Minor** — additive but expands the public surface |
| New `apps/broomva/` page or content | **Patch** (or no bump — website auto-deploys regardless) |
| `broomva-update-check` switches transport (raw VERSION → GitHub Releases API) | **Patch** — internal mechanism, observable behavior unchanged |
| Default flip (`auto_upgrade` defaults to `true`) | **Minor** — silently changes behavior for existing CLI users |
| Remove a deprecated CLI flag | **Minor** (pre-1.0) / **Major** (post-1.0) |
| Typo fix in README.md | **Patch** (or no release — docs-only changes can ship without a bump) |
| New Rust crate added under `crates/` that ships its own binary | **Minor** — new public artifact |

## Release checklist

Use this checklist for every release. The CI workflow `validate-release.yml` enforces the **VERSION ↔ CHANGELOG ↔ Cargo.toml** alignment automatically; the rest is human discipline.

1. **PR opens with**:
   - Root `VERSION` bumped to the new `X.Y.Z`.
   - `crates/broomva-cli/Cargo.toml` version field synced — run `bash scripts/sync-cargo-version.sh`.
   - `CHANGELOG.md` prepended with `## X.Y.Z — YYYY-MM-DD` section.
   - Any breaking changes documented under a `### Migration` subheading.
2. **Validate locally** — `bash scripts/sync-cargo-version.sh --check`, `shellcheck --exclude=SC1091,SC2155,SC2034 bin/* scripts/*.sh`, `bun run lint`, `bun run test:types`.
3. **CI passes** — `ci.yml` (lint/typecheck/asset probes) + `validate-release.yml` (version/changelog/Cargo.toml match).
4. **Reviewer approves** — at least one human or `pr-review-toolkit:code-reviewer` agent verdict. For substantive PRs (>200 LOC OR public API OR multi-file OR governance-class), fire the Cross-Review (P20) gate first.
5. **Merge to main** (squash). Vercel auto-deploys the website immediately; the CLI binary release is gated on tag (next step).
6. **Tag + GitHub Release** — manual until `release.yml` ships in a follow-up PR (see "Pipeline expansion roadmap"):
   ```bash
   git fetch origin && git checkout main && git pull --ff-only
   VERSION=$(cat VERSION)
   git tag -a "v${VERSION}" -m "v${VERSION} — <title from CHANGELOG>"
   git push origin "v${VERSION}"
   gh release create "v${VERSION}" \
     --title "v${VERSION} — <title>" \
     --notes-file <(awk "/^## ${VERSION}( |\$)/{flag=1; next} flag && /^## /{exit} flag" CHANGELOG.md)
   ```
7. **Downstream verification**:
   - `bin/broomva-update-check --force` from any install should now emit `UPGRADE_AVAILABLE <old> <new>` within the cache TTL window.
   - For CLI users: `cargo install broomva` resolves the new version once published to crates.io (future).
   - For website visitors: production should already be live — sanity-check `https://broomva.tech` deployed cleanly.

## Cadence

broomva.tech has no fixed release cadence. The triggers for a release are:

- A new CLI subcommand or behavior-changing default → **minor**.
- A bundle of fixes/docs ready to ship → **patch**.
- A critical bug or security issue → **patch**, immediately.
- Pure website content updates ship continuously via the Vercel main-deploy pipeline and do **not** require a version bump unless they're tied to a CLI/package change.

Avoid letting `main` accumulate more than 2–3 unreleased version-relevant PRs — each unreleased PR is invisible to CLI downstream installs.

## Backporting

broomva.tech does not maintain release branches. If a fix on `main` is needed urgently on a pinned install, the downstream user pins to a tag and applies the fix locally. There is no `0.3.x` branch to backport to.

## Retroactive tagging (history)

`broomva.tech` had **no prior tagged releases or GitHub Releases** before v0.4.0. The pre-0.4.0 VERSION values (`0.1.0` at root, `0.3.0` in `crates/broomva-cli/Cargo.toml`) reflect work-in-progress drift that was never formally shipped to downstream consumers.

The repository starts fresh at **v0.4.0** as the first formally-released version. There are no retroactive `v0.1.0` / `v0.2.0` / `v0.3.0` tags — those numbers are simply skipped to reconcile the VERSION ↔ Cargo.toml drift and mark a clean release-infrastructure baseline.

This is the same pattern bstack used at its v0.2.2 release: retroactively tag only the versions that ever had a stable downstream surface, then anchor the update-check transport to the first formally-released tag.

## Update check transport

`bin/broomva-update-check` (≥ 0.4.0) compares the local `VERSION` against:

1. **Primary**: GitHub Releases API — `GET /repos/broomva/broomva.tech/releases/latest`, read `.tag_name`, strip leading `v`.
2. **Fallback**: raw `VERSION` file on `main` (`https://raw.githubusercontent.com/broomva/broomva.tech/main/VERSION`) — used when the API is unreachable, rate-limited, or no releases exist yet.

This separation means **development-branch VERSION bumps do not leak as available upgrades to downstream installs** — only tagged releases do. Bump `VERSION` freely on a feature branch; downstream sees nothing until the tag lands.

Until the first GitHub Release ships (v0.4.0), the API returns 404 and the transport gracefully degrades to the fallback. After v0.4.0 lands, the API is the canonical answer.

## Disabling update checks

Downstream users can disable update checks entirely:

```bash
broomva-config set update_check false
```

## Multiple shipping units — coordination

A single release can affect multiple downstream surfaces. The discipline:

- **Website**: ships on every `main` merge — no version bump required for content-only changes. If a release introduces a website behavior coupled to a CLI/package change, the CHANGELOG entry calls that out.
- **CLI binary**: shipped via GitHub Releases (manual today; auto-tag-on-merge in a follow-up PR). The release artifact is the binary `broomva-{macos,linux}-{amd64,arm64}` plus a `sha256` checksum file.
- **Cargo crate**: shipped via `cargo publish` (manual today; auto in a follow-up PR). `crates/broomva-cli/Cargo.toml` version must equal root `VERSION` — `validate-release.yml` enforces this on every PR via `scripts/sync-cargo-version.sh --check`.
- **npm packages**: any package under `packages/` with `"private": false` is in scope. Today none of the workspace packages are published; when one is, it gets its own release-notes section in the CHANGELOG.

## Pipeline expansion roadmap

This release (0.4.0) ships the **release contract** — VERSION + CHANGELOG + validate-release.yml + GitHub Releases API transport + sync-cargo-version.sh. Subsequent PRs layer on top:

- **PR B (next)** — `.github/workflows/release.yml` auto-tag-on-merge when `VERSION` changes (mirrors bstack `release.yml`), plus CLI binary cross-compile + upload to release artifacts. After this lands, step 6 of the release checklist becomes "merge and wait".
- **PR C** — `bin/broomva` top-level dispatcher (mirrors `bin/bstack`). Subcommands: `update-check`, `config`, `release tag`, `version`.
- **PR D (future)** — `cargo publish` step inside `release.yml` so the crates.io publish happens on tag.
- **PR E (future)** — `npm publish` step for any `packages/*` that opt in via a `release` field in their `package.json`.

Each follow-up PR composes with this one — `release.yml` trusts that `validate-release.yml` already enforced VERSION/CHANGELOG/Cargo.toml alignment at PR time, so it can proceed without re-validating.

## Questions

See `CONTRIBUTING.md` for the contribution + PR shape. Cadence-or-policy questions belong in repo discussions; mechanical bugs in the release workflow are issues.
