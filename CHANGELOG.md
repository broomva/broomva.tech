# Changelog

## 0.8.0 — 2026-05-20

### `broomva chat` rewired to the real lifegw wire (BRO-1189)

Closes [BRO-1189](https://linear.app/broomva/issue/BRO-1189). Phase B (v0.6.0) shipped `broomva chat` with a `LifedHttpClient` + `TungsteniteStream` that invented its own routes / body shapes / frame names. Empirical probing against `lumen-smoke` (and source-level audit of `~/broomva/core/life/crates/life-runtime/lifegw/src/services/{agent_http.rs,ws.rs}`) revealed three independent gaps that broke `broomva chat` end-to-end:

1. **Body shape** — CLI sent `{name, input: {prompt}}`; lifegw expects `{user_id, project_id, label?, resume_sid?}` (responds with 422 `unknown field 'name'`).
2. **Route** — CLI hit `/v1/lifed/agent/create-session`; the real path is `/v1/agent/create_session` on lifegw (lifed has no HTTP surface — only gRPC over UDS).
3. **WS wire** — CLI used `?session=` + `?from_sequence=` query keys + invented `OutboundFrame::UserTurn` / `InboundFrame::Token` wire frames. lifegw uses `?sid=` + `?last_seq_no=` and `send_message` / `agent_event` JSON envelopes (`record.payload.text` carries the token delta; `agent_kind` = `TOKEN | FINISH | ERROR | TOOL_CALL_PENDING | TOOL_RESULT | APPROVAL_REQUIRED | HIBERNATE`).

Additionally surfaced + filed:

- **Lumen-smoke config gap** (NOT in this PR) — `scripts/lumen-smoke.sh` writes a `lifed.toml` with no `[auth]` section, so lifed reads the wrong JWKS path and rejects every Tier-2 lifegw mints. Manual workaround documented in the smoke runbook below; permanent fix is out-of-scope for this CLI PR and tracked separately.

### Scope

- **NEW** `api::lifed::LifegwChatClient` — HTTPS client for the real `POST /v1/agent/create_session` endpoint. Mirrors `lifegw::services::agent_http::CreateSessionBody` (`#[serde(deny_unknown_fields)]` posture, `skip_serializing_if` on optional fields so the strict deny doesn't blow up on null). Returns `CreateChatSessionResp { sid, agent_id, user_id, project_id, created_at_unix }`. Re-uses BRO-1186's TLS dev-cert seam for `lumen-smoke` self-signed gateways.
- **EDIT** `api::agent_stream::TungsteniteStream` — two-phase connect: (1) HTTP POST `/v1/agent/create_session` via `LifegwChatClient`, (2) WSS upgrade `?sid=<sid>&last_seq_no=<n>` with `Authorization: Bearer <Tier-1>` header. The `Sec-WebSocket-Protocol: bearer.<jwt>` browser path stays available on the lifegw side; Rust callers use the header form (canonical).
- **NEW** internal `api::agent_stream::wire` module — encapsulates the lifegw wire shapes (`WireOutbound { SendMessage, ApproveDispatch, CancelDispatch, Ping, Close }` + `WireInbound { AgentEvent { seq_no, record, agent_kind }, Pong, Closing }`) and translates them to the CLI's semantic types (`OutboundFrame`, `StreamEvent`). The CLI surface stays stable — `tests/chat_smoke.rs` `FakeStream` keeps working unchanged.
- **EDIT** `api::agent_stream::AgentStreamConfig` — adds `user_id`, `project_id`, `resume_existing_sid` fields. `DEFAULT_GATEWAY_URL` changes from `wss://lifegw.broomva.tech/v1/agent/stream` (full WS URL) to `https://lifegw.broomva.tech` (base URL); `TungsteniteStream` derives both the HTTPS create-session URL and the WSS stream URL from it. Source-breaking — hence the minor bump.
- **EDIT** `cli/chat.rs::ChatRunOpts` — adds `user_id_override` + `project_id_override` fields; `resolve()` now derives `user_id` via flag → `BROOMVA_USER_ID` env → token-derived (`dev-token-for-{user}` shortcut + best-effort `sub`-claim parse on real JWS) → fallback `default-user`. `project_id` defaults to `default`.
- **EDIT** `api::lifed::LifedClient` (legacy) — every method now returns `BroomvaError::Unsupported` with a `BRO-1190` pointer. `broomva agent` substrate wire is filed as a separate ticket because lifed exposes no HTTP/JSON surface today (only gRPC over UDS). The schema validation + dry-run + templates paths still work — only `agent run` / `list` / `get` / `tail` / `cancel` surface the unsupported error.
- **NEW** `error::BroomvaError::Unsupported(String)` variant for the surface-not-yet-wired pattern.
- **NEW** AgentEvent kind routing in the wire decoder: `TOKEN` → `StreamEvent::Token`; `FINISH` → `TurnComplete`; `ERROR` → `TurnError`; `TOOL_CALL_PENDING` / `TOOL_RESULT` / `APPROVAL_REQUIRED` / `HIBERNATE` → informational tokens (`[tool_call_pending]` etc.) so the REPL operator sees activity even without a dedicated UI affordance.

### Tests

129 lib tests + 14 integration tests = 143 total green (was 120 pre-PR; +23 net):

- `api/lifed.rs` — 9 new tests: `create_chat_session` happy path (with body match), 401→AuthRequired, 422→Api{body verbatim}, resume sid present + omitted, transport failure → User error, body shape round-trip + 3 legacy-Unsupported tests.
- `api/agent_stream.rs::tests` — 13 new tests: real-wire `TOKEN` / `FINISH` / `ERROR` / `TOOL_CALL_PENDING` decode, empty-text-payload defensive drop, unknown agent_kind drop, `pong` / `closing` drop, legacy fixtures still decode, outbound encoder produces real `send_message` / `cancel_dispatch` / `ping`, default config sanity.
- `cli/chat.rs::tests` — 5 new tests: `derive_user_id_from_token` dev-shortcut, empty dev-shortcut, garbage, real JWS sub-claim, default user/project on resolve.

### Composition

- BRO-1186 (TLS dev-cert) — `LifegwChatClient` re-uses `api::tls::load_extra_root_cert` + `build_tungstenite_connector` so no duplicate cert plumbing.
- BRO-1183 (PromptPushResponse) — unrelated; this PR doesn't touch the prompts surface.

### Manual smoke (BRO-1189 goal condition)

Procedure (replicates the verbatim smoke against `lumen-smoke`):

```bash
# Terminal A — bring up lumen-smoke + patch lifed config to read the
# lifegw JWKS path (workaround for the lumen-smoke.sh config gap).
cd ~/broomva/core/life/.worktrees/lumen-phase-alpha-m7-w
bash scripts/lumen-smoke.sh up
# Append a [auth] section to lifed.toml + restart lifed only:
cat >> /tmp/lumen-smoke/lifed.toml <<'EOF'

[auth]
jwks_path = "/tmp/lumen-smoke/run/lifegw-jwks.json"
substrate_signing_key_path = "/tmp/lumen-smoke/run/lifed-signing-key.pem"
substrate_jwks_publish_path = "/tmp/lumen-smoke/run/lifed-jwks.json"
revoked_sids_path = "/tmp/lumen-smoke/run/revoked_sids.json"
dev_signer_enabled = true
EOF
kill $(cat /tmp/lumen-smoke/lifed.pid)
nohup ./.target/debug/lifed daemon --allow-mock-fallback \
  --config /tmp/lumen-smoke/lifed.toml \
  >> /tmp/lumen-smoke/lifed.log 2>&1 &

# Terminal B — drive the new CLI.
cd ~/broomva/broomva.tech-worktrees/cli-phase-b1
cargo build --release -p broomva
CA=~/broomva/core/life/.worktrees/lumen-phase-alpha-m7-w/crates/life-runtime/lifegw/dev-tls/dev-ca.pem
target/release/broomva chat \
  --cacert $CA \
  --gateway-url https://127.0.0.1:8443 \
  --token "dev-token-for-test-user-1" \
  "say hello in three words"
```

Captured transcript in the PR body.

## 0.7.0 — 2026-05-19

### CLI surfaces GitHub-mirror failure on admin prompt push/update (BRO-1183)

Closes [BRO-1183](https://linear.app/broomva/issue/BRO-1183). The just-merged BRO-1181 server-side change (PR #176) added two operator signals to admin POST `/api/prompts` and PUT `/api/prompts/[slug]` responses — a `githubMirror: { ok, error? }` body field and a `Warning: 199 - "GitHub mirror failed: <text>"` HTTP header — but the Rust CLI consumer surfaced neither. Admin pushes that silently failed to mirror to GitHub still looked successful in the terminal; the user had to read JSON responses by hand to know whether their prompt reached the public broomva.tech page.

### Scope

- New operator-facing stderr line on `broomva prompts push` / `broomva prompts update` when the mirror failed:

  ```
  [broomva] WARNING: GitHub mirror failed: <reason>
  [broomva]   The prompt was saved to the database but did NOT reach the public broomva.tech page.
    Updated prompt: <slug>
  ```

- Stdout is unchanged — success summaries still print as before. The warning is additive on stderr, so JSON/script consumers that read stdout keep working. JSON-format callers see the `githubMirror` field embedded directly in the response.

### Deliverables

- **NEW** `api::types::GithubMirrorStatus { ok: bool, error: Option<String> }` (camelCase serde) and `PromptPushResponse { prompt: PromptDetail, warning_header: Option<String> }` wrapper for the create/update return path. `PromptDetail` gains `github_mirror: Option<GithubMirrorStatus>`; absence is the back-compat shape for GETs and older servers (`PromptDetail` does not set `deny_unknown_fields`).
- **EDIT** `api::mod::BroomvaClient::create_prompt` / `update_prompt` — return type now `BroomvaResult<PromptPushResponse>`. Source-breaking lib-target change, hence the `0.6.x → 0.7.0` minor bump.
- **NEW** `api::mod::extract_warning_header` — uses `headers.get_all(WARNING)` to handle RFC 7234 §5.5 multi-value Warning headers (multiple headers, comma-separated values inside one). Non-ASCII bytes preserved lossily via `String::from_utf8_lossy` + `tracing::warn!`; the operator signal is never silently dropped.
- **NEW** `cli::prompts::classify_mirror_warning` — body wins over header. Header fallback requires the `GitHub mirror failed: ` prefix so unrelated 199-warnings stay silent rather than being mis-attributed to the mirror feature.
- **NEW** `cli::prompts::surface_mirror_warning<W: io::Write>` — emits the two-line stderr message. Generic sink so handler tests can capture stderr without shelling out.
- **NEW** `cli::prompts::parse_warning_detail` — returns `Vec<&str>` of all 199 quoted warn-texts, scanning comma-separated warn-values inside a (possibly joined) header value, skipping non-199 codes.
- **NEW** `cli::prompts::handle_push_with_sink<W: io::Write>` — internal split of `handle_push` so the user-visible stderr path is testable. Public `handle_push` delegates with `io::stderr()`.

### Tests

103 lib tests + 11 integration + 6 chat smoke = 120 total green (was 111 pre-PR). New tests:

- `api/types.rs` — 3 deserialize tests (mirror ok / mirror failure / absent field).
- `cli/prompts.rs` parser — extracts envelope text, returns empty on garbage, handles multi-value header with mixed 110/199/214 warn-codes.
- `cli/prompts.rs` classifier — prefers body, ignores header on success, falls back to header only with the mirror prefix, surfaces placeholder when `body.error` is None.
- `cli/prompts.rs` surface — writes two lines on failure, stays silent on success.
- `cli/prompts.rs` handler — `handle_push_writes_warning_to_stderr_sink_on_mirror_failure` (genuine regression guard — drives `handle_push_with_sink` end-to-end with a `Vec<u8>` sink and asserts the sink contains the warning lines) + silent-on-success twin.
- Existing `create_prompt`/`update_prompt` wire tests updated to the new `PromptPushResponse` shape.

### Cross-review

P20 adversarial gate fired through 3 rounds against Codex GPT-5.4 (Strata A):

- Round 1: REVISE 4/10 (5 deductions: tuple API break, lenient parser, silent non-ASCII, duplicated stderr, missing handler test).
- Round 2: REVISE 6/10 (3 remaining: semver, multi-value Warning header, handler test still passed if surface_mirror_warning was removed).
- Round 3: **APPROVE 8/10** (2 non-blocking findings logged: M = RFC quoted-string scanner not strict parser; L = no client-level get_all-multi-instance test).

### Composition

- **P14 Dep-Chain**: upstream = BRO-1181 server response shape, `reqwest::header::HeaderMap::get_all`, `tracing::warn!`. Downstream = admin push users (new stderr signal), no external Rust lib consumers today.
- **P15 Snapshot**: branched from `main@4a0dbd7`; rebased onto `main@d578cfe` (BRO-1186 TLS dev-cert + 0.6.1) to pick up rustls/webpki-roots/rustls-pemfile direct deps and `api::tls` module.
- **P20 Cross-Review**: 3 rounds executed; final APPROVE 8/10.

## 0.6.1 — 2026-05-19

### TLS dev-cert escape hatch — unblocks local lifegw dogfood

Adds `--cacert <path>` and `BROOMVA_CA_CERT` to `broomva chat`, `broomva agent`, and every other subcommand that issues HTTP or WebSocket requests. The path is loaded as an extra root CA on top of the existing webpki-roots trust store — production CAs remain trusted; the only change is one extra accepted chain. Closes [BRO-1186](https://linear.app/broomva/issue/BRO-1186).

Before this patch the `v0.6.0` CLI could not reach a local lumen-smoke `lifegw` (`https://127.0.0.1:8443`) because `reqwest` was built with `rustls-tls` (webpki defaults only) and `tokio-tungstenite` with `rustls-tls-webpki-roots`. Self-signed dev certs failed handshake with `UnknownIssuer`; `curl --cacert <path>` worked but the CLI offered no equivalent flag. With this release the dev workflow is one flag away from working end-to-end.

### Scope

- **CLI**: new global flag `--cacert <PATH>` (clap `global = true`, `env = BROOMVA_CA_CERT`). Available on every subcommand that opens a network connection (`chat`, `agent run`, `agent list`, `agent get`, `agent tail`, `agent cancel`, `chat resume`, …).
- **HTTP path** (`reqwest`): when a path is supplied, the PEM is loaded via `reqwest::Certificate::from_pem` and added to the `ClientBuilder` via `add_root_certificate`. Used by `LifedHttpClient::with_dev_cert`.
- **WS path** (`tokio-tungstenite`): when a path is supplied, a `rustls::ClientConfig` is built from webpki defaults + the dev cert, wrapped in `Connector::Rustls`, and passed to `connect_async_tls_with_config`. Used by `agent_stream::TungsteniteStream::connect`.
- **No `--insecure` flag** by design (BRO-1186 §"Out of scope"). A future `BROOMVA_DEV_ALLOW_INSECURE=1` env-gated escape may land separately; this PR keeps the CA boundary intact.

### Deliverables

- **NEW** `crates/broomva-cli/src/api/tls.rs` — single seam for the dev-cert helper. Exposes `resolve_ca_cert_path` (flag > env > none), `load_extra_root_cert` (for reqwest), `build_tungstenite_connector` (for WS). 10 unit tests cover precedence, missing-file errors, malformed-PEM errors, and the empty-PEM edge case.
- **EDIT** `crates/broomva-cli/src/api/agent_stream.rs` — adds `ca_cert_path` to `AgentStreamConfig`; `TungsteniteStream::connect` switches between `connect_async` (default) and `connect_async_tls_with_config` (when dev cert is set) without changing the steady-state production path.
- **EDIT** `crates/broomva-cli/src/api/lifed.rs` — new `LifedHttpClient::with_dev_cert(base_url, token, ca_cert_path)` constructor preserves the existing `new(...)` signature for callers that don't need the escape hatch. `build_lifed_client` in `cli/agent.rs` now resolves the cert path and routes through `with_dev_cert`.
- **EDIT** `crates/broomva-cli/src/cli/chat.rs` — `ChatRunOpts.ca_cert_path: Option<String>` plus resolution in `ChatRunOpts::resolve()`. Existing tests gain `ca_cert_path: None`.
- **EDIT** `crates/broomva-cli/src/cli/agent.rs` — `AgentRunOpts.ca_cert_path: Option<String>` flows through to `build_lifed_client`.
- **EDIT** `crates/broomva-cli/src/cli/mod.rs` — global `cacert: Option<String>` field on `Cli`; threaded into both `ChatRunOpts` and `AgentRunOpts` at dispatch time.
- **EDIT** `crates/broomva-cli/tests/chat_smoke.rs` — fixture updates for the new `ChatRunOpts` field.
- **EDIT** `crates/broomva-cli/Cargo.toml` — adds direct deps `rustls 0.23` (feature-pruned to `std + ring + tls12`), `webpki-roots 0.26`, `rustls-pemfile 2`. All three are already in the dep tree transitively via `reqwest` + `tokio-tungstenite` at the same major-version pins, so no new crates enter the release binary; cargo deduplicates.

### Manual smoke (lumen-smoke local dogfood)

```bash
# Prereq: lumen-smoke lifegw running at https://127.0.0.1:8443. Point
# --cacert at the issuing CA (NOT the server leaf cert) — rustls is
# strict about CA constraints, unlike curl. For the lumen-smoke setup:
#   dev-ca.pem  ← issuing CA, what --cacert wants
#   cert.pem    ← server leaf, what the listener presents
broomva chat \
  --cacert ~/broomva/core/life/.worktrees/lumen-phase-alpha-m7-w/crates/life-runtime/lifegw/dev-tls/dev-ca.pem \
  --gateway-url "wss://127.0.0.1:8443/v1/agent/stream" \
  --token "dev-token-for-test-user-1" \
  "hello"

# OR via env (handy for shell-rc'd workflows):
export BROOMVA_CA_CERT="$HOME/broomva/core/life/.worktrees/lumen-phase-alpha-m7-w/crates/life-runtime/lifegw/dev-tls/dev-ca.pem"
export BROOMVA_TOKEN="dev-token-for-test-user-1"
broomva chat --gateway-url "wss://127.0.0.1:8443/v1/agent/stream" "hello"
```

Before this patch: `error: ws handshake failed: IO error: invalid peer certificate: UnknownIssuer`.
After this patch: TLS handshake succeeds against lumen-smoke; the remaining failure observed (`HTTP error: 200 OK` — gateway returned 200 on the upgrade path instead of 101 Switching Protocols) is a downstream wire-shape concern tracked under [BRO-1187](https://linear.app/broomva/issue/BRO-1187), not a TLS issue. That's the expected state for this PR.

A "pointed `--cacert` at the leaf cert by mistake" still surfaces `UnknownIssuer` — the strict-rustls behaviour we want; curl would silently accept it.

### Invariants verified

| Invariant | Verified by |
|---|---|
| Production CAs remain trusted when `--cacert` is unset | `api/tls.rs::tests::build_tungstenite_connector_returns_none_without_path` + `resolve_returns_none_when_neither_set` |
| Flag wins over env var | `api/tls.rs::tests::resolve_prefers_flag_over_env` |
| Env var fallback works alone | `api/tls.rs::tests::resolve_falls_back_to_env` |
| Missing file fails loudly (no silent fallback) | `api/tls.rs::tests::load_extra_root_cert_rejects_missing_file` + `build_tungstenite_connector_rejects_missing_file` |
| Malformed PEM fails loudly | `api/tls.rs::tests::load_extra_root_cert_rejects_garbage_pem` |
| Empty PEM (no CERTIFICATE block) fails loudly | `api/tls.rs::tests::build_tungstenite_connector_rejects_empty_pem` |
| Valid PEM loads | `api/tls.rs::tests::load_extra_root_cert_accepts_valid_pem` + `build_tungstenite_connector_loads_valid_pem` |
| End-to-end: dev gateway reachable | Manual smoke against lumen-smoke (see above) |

### Out of scope (separate tickets)

- `--insecure` blanket cert-disable flag — explicitly excluded per BRO-1186 design.
- `LifedHttpClient` URL/body-shape alignment with the real lifed wire — [BRO-1187](https://linear.app/broomva/issue/BRO-1187).
- Two-tier auth flow (lifegw mints user-cap from `BROOMVA_TOKEN`) — separate arc.

## 0.6.0 — 2026-05-19

### Phase B — broomva agent typed task invocation

Second substantive expansion of the CLI agent surface. Implements the **Agent Invocation Contract** (AC-1..AC-6) from `docs/specs/2026-05-18-broomva-cli-agent-chat-pipeline.md` §3.2: a typed, fire-and-watch agent task with structured input, declared output schema, cost-ceiling enforcement, and resumable transcripts. Closes Phase B of [BRO-1168](https://linear.app/broomva/issue/BRO-1168) (sub-issue [BRO-1170](https://linear.app/broomva/issue/BRO-1170)).

Where Phase A's `broomva chat` is *one agent loop, single session, interactive*, Phase B's `broomva agent` is *one task run, typed, non-interactive* — the next composable layer above the chat surface, and a prerequisite for Phase C (`broomva pipeline`) which composes N typed tasks via Symphony.

### Scope

- Task lifecycle: `broomva agent run <task.yaml>` validates the spec client-side, fires a telemetry beacon, submits to `lifed.Agent.CreateSession`, watches the event stream until terminal status. `--detach` returns immediately with `run_id`.
- Read paths: `broomva agent list` (newest-first), `broomva agent get <run-id>`, `broomva agent tail <run-id>` (resumable event stream), `broomva agent cancel <run-id>`.
- Templates: `broomva agent templates list|show <name>|init` — bundled starter tasks (`hello`, `summarize-pr`, `update-linear`, `daily-briefing`) embedded via `include_str!` and copied to `~/.broomva/templates/` on `init`.
- Filesystem layout: `~/.broomva/runs/<run_id>/{transcript.jsonl, output.json, metadata.yaml}`. ULID `run_id` (k-sortable; lexicographic order = chronological order).

### Deliverables

- **NEW** `crates/broomva-cli/src/cli/agent.rs` (876 LOC) — 6 subcommands, `AgentRunOpts` ↔ `Command::Agent` wiring, dry-run path, cost-ceiling guard, telemetry-beacon integration (reusing `BroomvaClient` from Phase A), schema-validated spec ingest.
- **NEW** `crates/broomva-cli/src/api/lifed.rs` (674 LOC) — typed `LifedClient` trait + `LifedHttpClient` HTTP/JSON implementation. gRPC/tonic wire deferred to Phase B.1 when the lifed gateway is reachable in CI (mirrors Phase A's strategy of starting with HTTP/JSON for the same `AgentStream` interface).
- **NEW** `crates/broomva-cli/src/api/output_validator.rs` (242 LOC) — post-run validation against task spec's `output.schema`. `OutputVerdict::{Passed, Failed { errors }, Skipped { reason }}`. Skipped when no schema declared.
- **NEW** `crates/broomva-cli/schemas/agent-task.v1.json` — JSON Schema Draft 2020-12, embedded via `include_str!` at compile time so the validator is deterministic across install paths. `additionalProperties: false` at the root + `input` object closes the spec contract.
- **NEW** `crates/broomva-cli/templates/{hello,summarize-pr,update-linear,daily-briefing}.task.yaml` — 4 starter task specs. `hello.task.yaml` is the minimal proof-of-roundtrip (no tools, no output schema, no cost cap); the others demonstrate `tools`, `output.schema`, and `max_cost_usd`.
- **NEW** `crates/broomva-cli/tests/agent_task_validation.rs` — integration tests at the library boundary: 4 positive fixtures (each bundled template loads from disk and validates) + 7 negative fixtures (missing prompt, unknown top-level key, empty prompt, negative cost, zero timeout, missing name, non-object root). Closes spec §6 Phase B test-plan deliverable.
- **EDIT** `crates/broomva-cli/src/cli/mod.rs` — registers `Command::Agent` enum variant with `AgentCommand` subcommands (Run / List / Get / Tail / Cancel / Templates). Adds three shared flags (`--lifed-url`, `--turn-timeout`, `--format`).
- **EDIT** `crates/broomva-cli/src/api/mod.rs` — exposes `lifed` + `output_validator` submodules.
- **EDIT** `crates/broomva-cli/Cargo.toml` — adds `jsonschema 0.40` (Draft 2020-12 validator), `serde_yaml 0.9`, `ulid 1`. Bumps `version` to `0.6.0` (in lockstep with VERSION; `validate-release.yml` gate enforces).

### Phase A blockers closed

The Phase A handoff (PR #173 comments) flagged 5 deferred follow-ups; Phase B closes the agent-relevant ones:

- ✅ `--turn-timeout` flag — wired through `AgentRunOpts.turn_timeout_seconds` → `AgentTaskSpec.agent.timeout_seconds` override.
- ✅ Telemetry beacons — `agent run` fires `beacon_agent_run` before lifed submission and `mark_beacon` on terminal status. Reuses Phase A's `BroomvaClient` invocation surface; no new wire shape.
- ⚠️ `spawn_driver` wired into long-lived sessions — partial: `agent tail` uses `LifedHttpClient::stream_events` (mirrors the trait shape Phase A established for `AgentStream`), but full persistent-connection composition with Phase A's `agent_stream::spawn_driver` is Phase B.1 (requires gRPC bidi stream once tonic is wired).
- Deferred to Phase D polish: server-assigned `session_id` echo, live SLO measurement env (`BROOMVA_LIVE_INTEGRATION=1`).

### Invariants verified (AC-1..AC-6 from spec §3.2)

| ID | Invariant | Verified by |
|---|---|---|
| AC-1 | Task spec validates against `schemas/agent-task.v1.json` before submit | `tests/agent_task_validation.rs::template_*_validates` + `cli::agent::tests::validate_task_spec_*` (10 unit + 11 integration tests cover the schema surface) |
| AC-2 | Every run gets a ULID `run_id` + persistent transcript | `cli::agent::tests::output_save_path_*` + run-metadata round-trip; `~/.broomva/runs/<run_id>/` layout written by `handle_run` |
| AC-3 | Cost ceiling enforced client-side before submit | `handle_run` rejects when `estimate_cost_usd(&spec) > max_cost_usd`; lifed enforces runtime budget per Spec D wallet (substrate side) |
| AC-4 | Tool authorization respects gates | Deferred to lifed runtime (out of CLI scope); CLI surfaces the declared `tools` set without modification |
| AC-5 | Output validates against declared `output.schema` | `api::output_validator::validate_output` + `--skip-output-validation` escape hatch; verdict logged in `metadata.yaml` |
| AC-6 | Failed runs resumable from last successful step | `agent tail <run-id>` re-attaches to the event stream by `last_seq`; persistent transcript on disk seeds the replay |

### SLO targets

Targets declared per the spec; live measurement (`BROOMVA_LIVE_INTEGRATION=1`) is deferred until lifed is reachable in CI. Unit + integration suite verifies state-machine correctness rather than wall-clock.

- `broomva agent run <task>` submit-to-queued p99 < 2s
- `broomva agent tail <run-id>` first-event-to-render p99 < 500ms
- `broomva agent list` (50 runs) p99 < 1s

### Risks + mitigations

- **gRPC stub vs real wire divergence** — `LifedHttpClient` is HTTP/JSON today; the `LifedClient` trait stays the abstraction Phase B.1 will swap tonic in for. Same pattern Phase A used for `AgentStream`. CHANGELOG honestly notes this; no silent stubbing.
- **JSON Schema validator footguns** — `additionalProperties: false` at every closed-object node; `exclusiveMinimum` removed (Draft 2020-12 expects a number value, not boolean — caught at first compile and fixed pre-merge).
- **Cost-estimate stub mistaken for real enforcement** — `ESTIMATE_USD_PER_TOKEN = 4.2e-6` is documented as a stub blended rate. Real per-model pricing lands when lifed exposes a model-pricing endpoint.
- **`~/.broomva/runs/` unbounded growth** — known limitation; pruning lands in Phase D polish alongside `chat sessions prune`. ULID-sortable dirs make `broomva agent runs prune --older-than <duration>` mechanical.
- **Telemetry beacon failures must never block** — `beacon_agent_run` swallows transport errors and logs; lifed submission proceeds regardless. Same posture as Phase A's beacons.

### Design choices

- **`run` defaults to sync** (watch the saga until terminal status) — shell-friendly, pipeable. `--detach` returns `run_id` immediately for fire-and-forget. Resolves spec §10 open question "sync vs async default".
- **HTTP/JSON-first via `LifedHttpClient`** — matches the Phase A precedent of "ship the contract; swap the transport in a follow-up". Reduces Phase B blast radius; defers tonic + tonic-build until lifed protos are stable and CI-reachable.
- **ULID over UUID v4** for `run_id` — k-sortable filesystem layout. Phase A used UUID v4 for `session_id` (different lifecycle); they don't cross paths.
- **Schema validation library**: `jsonschema 0.40` with Draft 2020-12. Single validator, no multi-draft branching.

### What's not in this release (Phase B.1 + Phase D)

- Real gRPC/tonic wire (Phase B.1).
- Live SLO measurement under `BROOMVA_LIVE_INTEGRATION=1` (Phase D polish).
- `broomva agent runs prune` (Phase D polish).
- Output-schema `format` keyword coverage beyond `string` / `number` (Phase D polish if requested).
- Per-tool scope-token minting (gated by Spec D wallet readiness; substrate-side, not CLI).

---

## 0.5.1 — 2026-05-18

### Phase A hotfix — release.yml shell quoting for titles with special chars

v0.5.0 merged cleanly but the `Release on merge` workflow failed at the tag step: the `### ` CHANGELOG heading contained backticks (around `broomva chat`) which the tag step expanded as command substitution when interpolating the title into bash. Result: tag was never created, no release published, no CLI binaries built.

This patch:

- **CHANGED** `.github/workflows/release.yml` — `Tag + create GitHub Release` step now writes the title to a tempfile and references it as a file argument rather than interpolating through a bash variable, so any character that might trigger shell expansion (backticks, dollar signs, etc.) is treated as literal text. Also drops the title from the annotated-tag message body and the release title; the release notes file already carries the substantive title in its first heading.
- **CHANGED** `CHANGELOG.md` — v0.5.0 section's `### ` heading rewritten without backticks so the rerun under the hardened workflow succeeds end-to-end. Substantive entry body unchanged.
- **EDIT** `VERSION` to 0.5.1 and `crates/broomva-cli/Cargo.toml` `version` in lockstep.

No binary or surface changes. Phase A's `broomva chat` REPL ships exactly as merged in #173; this hotfix only re-runs the release pipeline that v0.5.0 was supposed to trigger.

## 0.5.0 — 2026-05-18

### Phase A — broomva chat interactive REPL

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
