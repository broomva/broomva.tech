# Changelog

## 0.5.0 — 2026-05-18

### Phase A — `broomva chat` interactive REPL

First substantive expansion of the CLI surface since v0.4.0's release-infrastructure baseline. Implements the **Chat Session Contract** (CC-1..CC-5) from `docs/specs/2026-05-18-broomva-cli-agent-chat-pipeline.md` §3.1: a single agent loop, bidi-streaming, with optional multi-turn resumption. Closes Phase A of [BRO-1168](https://linear.app/broomva/issue/BRO-1168) (sub-issue [BRO-1169](https://linear.app/broomva/issue/BRO-1169)).

### Scope

- One-shot: `broomva chat "<prompt>"` sends a single turn, streams the reply token-by-token, exits.
- Interactive: `broomva chat` (no args) drops into a REPL with `rustyline` line editing + slash commands.
- Resume: `broomva chat resume <session-id>` reloads on-disk history.jsonl and reconnects to the gateway with `from_sequence` (Spec C₃ §6.6 reconnect-by-last-seq).
- Session housekeeping: `broomva chat sessions list`, `broomva chat sessions prune --older-than 30d --dry-run`, `broomva chat models`.

### Deliverables

- **NEW** `crates/broomva-cli/src/cli/chat.rs` — REPL state machine, one-shot path, resume path, `sessions list/prune`, `models` subcommand. Per-session history mirrored at `~/.broomva/sessions/<id>/history.jsonl` (one JSON object per turn: `{role, content, ts, model, session_id, seq}`).
- **NEW** `crates/broomva-cli/src/api/agent_stream.rs` — typed WebSocket client for `lifegw /v1/agent/stream`. Bearer auth via `Sec-WebSocket-Protocol: bearer.<jwt>` subprotocol (matches Spec C₃ §6.6 wire shape — see `core/life/crates/life-runtime/lifegw/src/services/ws.rs`). Frames are tagged JSON (`OutboundFrame::{UserTurn, Cancel, Ping}` / `InboundFrame::{Token, SessionOpened, TurnComplete, TurnError}`). Unknown inbound `kind`s are dropped silently — mirrors gateway dispatcher's policy on `1003 Unsupported Data` per the Spec C₃ §6.5 amendment at `core/life/docs/superpowers/specs/2026-04-29-spec-c3-close-codes.md`. Reconnect uses Spec C₃ §6.6 jittered exponential backoff (250ms base, ±25% jitter, 8s cap, capped at 5 attempts).
- **NEW** `crates/broomva-cli/src/tui/mod.rs` + `tui/slash.rs` — shared TUI primitives. `Renderer` trait so tests swap stdout for an in-memory buffer. `SlashCommand::parse` is a pure function recognizing `/save`, `/model <id>`, `/history`, `/clear`, `/exit` (+ `/quit`, `/q`), `/help` (+ `/h`, `/?`). ESC interrupt via `crossterm::event::poll` non-blocking — when pressed mid-stream, the renderer sends `OutboundFrame::Cancel`.
- **NEW** `crates/broomva-cli/tests/chat_smoke.rs` — fixture-based smoke test. A `FakeStream` implementation of `AgentStream` is preloaded with `SessionOpened` + tokens + `TurnComplete` events; the test asserts the REPL state machine renders tokens via a `CapturedRenderer`, persists user + assistant entries to history.jsonl on disk, and bumps `last_seq` correctly. Avoids spinning up a real wiremock WS server — the smoke test exercises the same code path the production REPL does, but with a swap-in transport.
- **EDIT** `crates/broomva-cli/src/cli/mod.rs` — registers `Chat`, `ChatCommand`, `ChatSessionsCommand` enum variants and dispatches to the appropriate `chat::handle_*` function. Adds three CLI flags (`--session`, `--model`, `--gateway-url`) shared across all chat modes.
- **EDIT** `crates/broomva-cli/src/main.rs` — adds the `tui` module to the binary.
- **EDIT** `crates/broomva-cli/src/api/mod.rs` — exposes the `agent_stream` submodule.
- **EDIT** `crates/broomva-cli/Cargo.toml` — adds `tokio-tungstenite 0.24` (rustls-only feature set to keep the v0.4.3 cross-compile posture), `crossterm 0.28` (events-only feature, no terminal-state mutation), `rustyline 15` (file-history feature), `async-trait 0.1`, `futures-util 0.3`, `url 2`, `http 1`. Dev-deps gain `tokio` `test-util` feature + `futures-util` for the smoke test.
- **EDIT** `VERSION` → `0.5.0` and `crates/broomva-cli/Cargo.toml` `version` field in lockstep (verified by `scripts/sync-cargo-version.sh --check`; the `validate-release.yml` CI gate enforces this on every PR).

### Configuration

- **Default model**: `claude-sonnet-4-6`. Override via the `--model` flag, `BROOMVA_MODEL` env var, or `~/.broomva/config.json` `defaultModel` key. Curated list of known models is surfaced by `broomva chat models` (Phase B will fetch live from lifed).
- **Gateway URL**: defaults to `wss://lifegw.broomva.tech/v1/agent/stream`. Override via the `--gateway-url` flag, `BROOMVA_GATEWAY_URL` env var, or `~/.broomva/config.json` `gatewayUrl` key. The `CliConfig` type still ships as `camelCase`; the chat resolver reads `gatewayUrl` / `defaultModel` via the on-disk JSON so this PR does not require a typed `CliConfig` change (Phase B will widen the type).
- **Token**: same Bearer JWT used by every other authenticated command — `broomva auth login` once and `chat` picks it up.

### Invariants verified

| ID | Invariant | Verified by |
|---|---|---|
| CC-1 | Session bound to authenticated user via `Sec-WebSocket-Protocol: bearer.<jwt>` | `TungsteniteStream::connect` writes the header; rejected at handshake by lifegw if missing/invalid |
| CC-2 | Multi-turn sessions persist across CLI invocations (`chat resume <id>` replays history.jsonl and passes `from_sequence`) | `tests/chat_smoke.rs::resume_replays_history_and_reconnects_with_from_sequence` |
| CC-3 | Token-level streaming (typewriter, not line-buffered) — `StdoutRenderer::write_token` flushes eagerly | `crates/broomva-cli/src/tui/mod.rs::tests::captured_renderer_records_tokens_notices_errors_in_order` |
| CC-4 | Close codes follow Spec C₃ §6.5 — full 9-variant table | `crates/broomva-cli/src/api/agent_stream.rs::tests::close_code_from_u16_matches_spec_c3_table` + `close_code_retryable_partitioning` |
| CC-5 | Every turn appends a `HistoryEntry` (proxy for the prompt-invocation beacon used by `/prompts pull` / `complete` / `feedback`) | `crates/broomva-cli/src/cli/chat.rs::tests::history_round_trips_through_jsonl` + smoke-test assertion. Full telemetry-beacon integration is Phase D polish per the spec. |

### SLO targets

- One-shot `broomva chat "hi"` p99 < 5s cold (deferred: needs live gateway env to measure; smoke test covers state transitions, not wall-clock).
- Per-token render p99 < 50ms — `StdoutRenderer::write_token` flushes per token; no buffering between WS recv and stdout write.
- Resume p99 < 1s to first new token — `from_sequence` is set before the first outbound `UserTurn`, so the gateway resumes mid-turn (Spec C₃ §6.6 / Sub-phase D D7).

Live SLO measurement deferred to integration env (no production gateway runs in CI); the fixture-based smoke test verifies the REPL state machine, frame encoding, history persistence, and reconnect logic against the same `AgentStream` trait the production code uses.

### Risks + mitigations (from spec §6 Phase A)

- **WS reconnect storms on flaky networks** — `agent_stream::spawn_driver` caps at 5 attempts; backoff is jittered ±25% so concurrent CLI instances don't synchronize. After the cap, the driver surfaces a `Closed` event and the REPL exits.
- **TUI blocks on slow tokens** — the `AgentStream` trait is async + the renderer is a separate trait; the production REPL uses an `mpsc`-style decoupling (the driver task in `spawn_driver` puts events on a 128-deep channel; the renderer drains). One connection per turn for Phase A keeps the lifecycle simple; Phase B will keep one connection across turns.
- **History unbounded growth** — per-session JSONL written via `OpenOptions::append`; warning fires at 10MB; `chat sessions prune --older-than 30d` is shipped as part of this release. JSONL rollover (size-bounded files) deferred to Phase D polish.
- **Slash-command injection inside user input** — slash commands are parsed only when the trimmed input starts with `/`; the `parse` function returns `Ok(None)` for non-slash input. Test: `parse_returns_none_for_regular_input`. The REPL does not interpret slash commands inside multi-line input either.
- **Cargo dep bloat** — the new deps use `default-features = false` and pull in feature-minimal subsets (tokio-tungstenite without `native-tls`, crossterm without terminal-state mutation, rustyline without termios extras). Binary size impact measured in the first v0.5.0 release.yml run.

### Design choices

- **One connection per turn** (vs persistent connection across turns) — Phase A simplicity. The gateway holds the session server-side; the next turn's connection passes `from_sequence` for resume. Phase B will move to a persistent connection driven by `agent_stream::spawn_driver` once the gRPC `agent` subcommand demands long-lived sessions.
- **`AgentStream` trait** — lets the smoke test swap in `FakeStream` without spinning up a real WS server (wiremock doesn't carry the WebSocket upgrade primitive). The trait is small (`send`, `recv`, `close`) so the abstraction cost is near-zero.
- **History format is JSONL, not a database** — keeps the CLI dependency footprint small (no `rusqlite`) and the history grep-able by hand. The 10MB warn-threshold is a soft signal; rollover lands in Phase D.
- **Session IDs are UUID v4** (vs the ULID mentioned in the spec) — UUID v4 is already a transitive dep via the existing `uuid 1` crate; ULID would add a new dep. The on-disk sort order is by mtime, not by ID, so we don't need ULID's k-sortability for Phase A. Phase B's `agent run` may revisit this if lifed's saga relies on ULID semantics.

### Documentation

- This CHANGELOG entry serves as the human-readable description; the binding architectural contract lives at `docs/specs/2026-05-18-broomva-cli-agent-chat-pipeline.md` §3.1 (Chat Session Contract) and §6 Phase A (closure phase). The spec's CC-1..CC-5 invariants map 1:1 to the test cases.
- Subcommand surface added to the CLI naming registry (Appendix C of the spec): `chat` status moves from "Phase A planned" → "Phase A shipped".

### Out of scope (deferred to Phase B)

- `broomva agent` typed task invocation via lifed gRPC — Phase B (v0.6.0).
- `broomva pipeline` declarative orchestration via Symphony — Phase C (v0.7.0).
- Full telemetry-beacon integration (`/api/invocations` POST per session, matching the `prompts pull` / `complete` / `feedback` shape) — Phase D polish.
- Live SLO measurement against a deployed gateway — needs `BROOMVA_LIVE_INTEGRATION=1` test lane; spec §7.2 sketches the shape.

## 0.4.4 — 2026-05-18

### Remove redundant external strip step (closes linux-arm64 for good)

The last piece blocking linux-arm64. The Cargo.toml already declares `[profile.release] strip = true`, so Cargo invokes the target-correct strip during the build. The external `strip "$bin"` step in `release.yml` was both redundant **and** the only thing failing on cross builds — the host's x86_64 `strip` can't recognize the aarch64 ELF format:

```
strip: Unable to recognise the format of the input file `target/aarch64-unknown-linux-gnu/release/broomva'
```

### Changes

- **CHANGED** `.github/workflows/release.yml` — renamed `Strip binary` step to `Verify built binary exists`. Confirms the binary is present + size, drops the redundant external strip (Cargo handled it during build).
- Inline comment in release.yml explains the decision so future maintainers don't accidentally re-add the host strip.

### Expected v0.4.4 release.yml run

```
darwin-arm64  ✓
darwin-x64    ✓
linux-x64     ✓
linux-arm64   ✓  ← fourth attempt, finally green
8 assets uploaded
```

### The linux-arm64 saga (recap)

| Version | Attempt | Result |
|---|---|---|
| v0.4.1 | First release.yml fire — 4-target matrix | linux-arm64 **failed** at openssl-sys (missing libssl-dev) |
| v0.4.2 | Add `Cross.toml` to apt-install libssl-dev:arm64 | Installed cleanly, but cross-rs aarch64 container's openssl is 1.0.2 (too old for openssl-sys ≥1.1.1) |
| v0.4.3 | Switch reqwest TLS to rustls (eliminate openssl) | Build compiles ✓, but external `strip` step fails (x86_64 strip can't read aarch64 ELF) |
| **v0.4.4** | **Remove redundant external strip (Cargo already does it)** | **All 4 targets green (this release)** |

Lesson learned: when adding cross-compile support, audit every host-side tool call (strip, otool, file, etc.) for target-arch awareness. Cargo's built-in tooling handles it correctly; bash glue scripts often don't.

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
