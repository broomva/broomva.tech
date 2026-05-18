---
title: broomva CLI — agent + chat + pipeline subcommands
date: 2026-05-18
status: draft
target_versions: v0.5.0 → v0.7.0
authors:
  - Carlos D. Escobar-Valbuena (broomva)
  - Claude Opus 4.7 (1M context)
supersedes: none
ratifies: implicit conventions in v0.4.4
companion: BRO-1168
---

# broomva CLI — agent + chat + pipeline subcommands

> Architectural spec for the three CLI subcommands that turn `broomva` from a plumbing tool into an interactive agent driver. Closes the gap surfaced after v0.4.4: today the CLI ships auth + prompts + skills + daemon + relay + console + context + config, but no direct way to **invoke an agent, hold a chat, or run a pipeline**. This spec defines what those three surfaces look like.

## Table of contents

1. [What these subcommands are precisely](#1-what-these-subcommands-are-precisely)
2. [Current state inventory (v0.4.4)](#2-current-state-inventory-v044)
3. [Architectural contracts](#3-architectural-contracts)
4. [Gap catalog](#4-gap-catalog)
5. [Target architecture](#5-target-architecture)
6. [Closure phases (work breakdown)](#6-closure-phases-work-breakdown)
7. [Test plan](#7-test-plan)
8. [Risks and mitigations](#8-risks-and-mitigations)
9. [Out of scope](#9-out-of-scope)
10. [Open questions](#10-open-questions)
11. [Glossary](#11-glossary)

---

## 1. What these subcommands are precisely

`broomva-cli` today (v0.4.4) is **operational plumbing** for broomva.tech: it manages auth, fetches prompts, lists skills, runs a local infrastructure-monitoring daemon, registers the machine as a relay node, and surfaces project context. What it does **not** do is let the user *talk to an agent*, *invoke an agent task*, or *compose multiple agent steps*. Those have to happen through the dashboard (broomva.tech), through chatOS, or through Claude Code / Codex / Cursor.

This spec defines three subcommands that close that gap:

| Subcommand | Purpose | Shape | Time scale |
|---|---|---|---|
| `broomva chat` | One agent loop, interactive REPL or one-shot, streaming, with optional multi-turn resumption | **stdin/stdout REPL** with streaming tokens + history | seconds-minutes |
| `broomva agent` | One typed agent task end-to-end, no human in the loop, returns when done | **fire-and-watch** with structured output (table/json) | minutes-hours |
| `broomva pipeline` | N agent steps composed declaratively, orchestrated by Symphony | **declarative YAML/TOML** + watch run | minutes-days |

The composition story:

- `chat` = **one** agent loop, **single** session, interactive.
- `agent` = **one** task run, **typed**, non-interactive.
- `pipeline` = **N** task runs, **composed**, declarative.

Each subcommand maps to a different runtime contract within the Broomva substrate (Life Agent OS):

- `chat` → `lifegw /agent/stream` (Spec C₃ WebSocket interface) — single bidi connection, token-by-token streaming
- `agent` → `lifed Agent.CreateSession` + `StreamSession` (Spec D AnimaCustody, Spec E InferenceBackend) — typed session, multi-step
- `pipeline` → `Symphony` REST API (`/symphony/runs`) — orchestrated DAG of agent invocations

All three respect the same auth surface (`broomva auth login`), the same config (`~/.broomva/config.yaml`), and the same telemetry plane (the existing `broomva prompts` invocation/feedback model extends naturally).

---

## 2. Current state inventory (v0.4.4)

What ships today that these new subcommands compose on top of. Grounded in `crates/broomva-cli/src/` (commit `4058d61`).

### 2.1 CLI subcommand surface (9 top-level)

| Subcommand | LOC | What it does |
|---|---|---|
| `setup` | 367 | Interactive onboarding wizard |
| `auth` | 65 | login (device-code OR token), logout, status, token |
| `prompts` | 701 | CRUD + pull/push/complete/feedback (first-class prompt library) |
| `skills` | 83 | list/get/install (broomva.tech catalog, distinct from `bstack skills install`) |
| `context` | 87 | show / conventions / stack (project introspection) |
| `config` | 146 | set / get / reset |
| `daemon` | 282 | start/stop/status/logs/tasks (local monitoring with sensors) |
| `console` | 112 | status / sessions / health |
| `relay` | 442 | auth / start / stop / status / sessions (distributed agent relay node) |

Total: **2,976 LOC** across the cli/ module.

### 2.2 Infrastructure plumbing

| Module | Role |
|---|---|
| `src/api/` | HTTP client for broomva.tech REST API (`auth.rs`, `types.rs`) |
| `src/daemon/symphony_client.rs` | HTTP client for Symphony state — **already exists** |
| `src/daemon/sensors/` | api_health, railway_health, site_health |
| `src/daemon/dashboard.rs` | Local axum dashboard at `localhost:<port>` |
| `src/daemon/heartbeat.rs` | Periodic ping back to broomva.tech |
| `src/telemetry/` | Invocation tracking (used by `prompts pull` / `complete` / `feedback`) |
| `src/config/` | `~/.broomva/config.yaml` reader/writer |

### 2.3 Out-of-CLI substrate this spec composes on

| Component | Lives in | Provides |
|---|---|---|
| `lifegw` | `~/broomva/core/life/crates/lifegw/` | Edge gateway, JWT-auth, WebSocket `/agent/stream` (Spec C₃), tonic-web proxy to lifed |
| `lifed` | `~/broomva/core/life/crates/lifed/` | Facade daemon: Agent.CreateSession, StreamSession, Wallet, Identity (Spec D) |
| `Spec E InferenceBackend` | `~/broomva/core/life/crates/inference/` | KV-cache-aware agent loop compute primitive (Spec E-Sub-A shipped) |
| `Symphony` | `~/broomva/core/symphony/` | Orchestration daemon, REST API for run lifecycle |
| `Arcan` | `~/broomva/core/life/crates/arcan/` | L0 agent loop, the canonical operating mode for autonomous sessions |
| `AnimaCustody` | Spec D | Per-user identity (custody oracle, passkey-based or KMS-backed) |
| `Lago` | `~/broomva/core/life/crates/lago/` | Content-addressed blob store + event log; used for session artifacts |

### 2.4 Auth + telemetry foundation (already proven)

The CLI already proves the auth + telemetry shape via `prompts`:

- `broomva prompts pull <slug>` → fires a telemetry beacon, returns an `invocation_id`
- `broomva prompts complete <invocation_id> --status=completed|failed|abandoned`
- `broomva prompts feedback <invocation_id> --thumbs=up|down`

The three new subcommands inherit this pattern: every session/run/pipeline has an invocation id, completion status, and feedback. The user can ask "which agent runs failed last week?" via the existing telemetry plane.

---

## 3. Architectural contracts

The three subcommands define three contracts. Each specifies WHAT it is, WHO provides it, WHO consumes it, INVARIANTS.

### 3.1 Chat Session Contract

A **chat session** is a single agent loop bound to a single user, with bidi streaming, optional multi-turn resumption, and a typed close code.

**Provider**: `lifegw /agent/stream` (Spec C₃) — already shipped, WebSocket upgrade with `Sec-WebSocket-Protocol: bearer.<jwt>`.

**Consumer**: `broomva chat` CLI.

**Schema (CLI-side state)**:

```rust
pub struct ChatSession {
    pub id: String,          // server-issued session id (ULID)
    pub anima_did: String,   // user's DID
    pub created_at: DateTime<Utc>,
    pub model: Option<String>,        // e.g. "claude-opus-4-7"
    pub last_turn_seq: u64,
    pub status: ChatStatus,            // active | paused | closed
}
```

**Invariants**:

| ID | Invariant | Verified by |
|---|---|---|
| CC-1 | Session is bound to an authenticated user (JWT in `Sec-WebSocket-Protocol: bearer.<jwt>`) | lifegw rejects unauthenticated upgrades |
| CC-2 | Multi-turn sessions persist across CLI invocations (`--session <id>` resumes) | server-side session store + WS reconnect with `last_seq` |
| CC-3 | Streaming output is token-level (typewriter), not line-buffered | WS frames per token |
| CC-4 | Close codes follow Spec C₃ §6.5 (1003 unknown frame, 4001 invalid auth, etc.) | client maps codes → user-readable error |
| CC-5 | Every session emits a telemetry beacon with `invocation_id` for `broomva prompts feedback` compatibility | telemetry/ module |

### 3.2 Agent Invocation Contract

An **agent invocation** is a single typed agent task: input spec + structured output + lifecycle events.

**Provider**: `lifed.Agent.CreateSession` (Spec D's 4-step saga: CreateAgent → OpenLagoNamespace → BindWallet → RegisterAnimaSession) + `StreamSession` for progress events.

**Consumer**: `broomva agent` CLI.

**Schema (task spec)**:

```yaml
# task.yaml — broomva agent run <task-spec.yaml>
task:
  name: "summarize-pr-and-update-linear"
  description: "Generate a PR summary and post to Linear"
  inputs:
    - name: pr_url
      type: url
      required: true
    - name: linear_issue
      type: string
      required: true
  agent:
    backend: claude-opus-4-7      # any registered InferenceBackend
    tools: [github_read, linear_write]
    timeout_seconds: 600
    max_cost_usd: 5.0
  output:
    schema:
      summary: string
      decision_log: array<string>
    save_to: ~/.broomva/runs/{run_id}/output.json
```

**Invariants**:

| ID | Invariant | Verified by |
|---|---|---|
| AC-1 | Task spec validates against `schemas/agent-task.v1.json` | client-side jsonschema before submit |
| AC-2 | Every run gets a `run_id` (ULID) + persistent transcript in Lago | lifed → Lago `register_session_artifacts` |
| AC-3 | Cost ceiling (`max_cost_usd`) is enforced by lifed's wallet check before each tool call | Spec D Wallet.Transfer simulation |
| AC-4 | Tool authorization respects `auto_merge` / `policy.yaml` style gates | future: lifed gate check per tool call |
| AC-5 | Output validates against the declared output.schema | client-side post-run check |
| AC-6 | Failed runs are resumable from the last successful step (idempotent saga restart) | Spec D saga restart pattern |

### 3.3 Pipeline Definition Contract

A **pipeline** is an N-step composition of agent invocations, with explicit dependencies, parallel fanout (P5), and per-step retry/failure handling.

**Provider**: Symphony orchestration daemon (already wired via `daemon/symphony_client.rs`).

**Consumer**: `broomva pipeline` CLI.

**Schema (pipeline definition)**:

```yaml
# pipeline.yaml — broomva pipeline run pipeline.yaml
pipeline:
  name: "weekly-stakeholder-update"
  schedule: "0 9 * * MON"             # optional cron, for daemon scheduling
  steps:
    - name: gather-linear
      run: linear_export
      params: { team: Broomva, since: -7d }
    - name: gather-prs
      run: github_summary
      params: { repos: [broomva/bstack, broomva/broomva.tech], since: -7d }
      parallel_with: [gather-linear]   # fan-out (P5)
    - name: synthesize
      run: agent
      depends_on: [gather-linear, gather-prs]
      task: ./synthesize.task.yaml      # references an Agent Invocation Contract
    - name: draft-update
      run: agent
      depends_on: [synthesize]
      task: ./stakeholder-draft.task.yaml
    - name: deliver
      run: stakeholder_update           # broomva/stakeholder-update skill invocation
      depends_on: [draft-update]
      params: { channels: [slack, linear] }
  on_failure: continue                  # continue | abort | retry
  notifications:
    - on: [step_failure, pipeline_complete]
      to: linear://team/Broomva
```

**Invariants**:

| ID | Invariant | Verified by |
|---|---|---|
| PC-1 | Pipeline definition validates against `schemas/pipeline.v1.json` | client-side jsonschema |
| PC-2 | Step DAG is acyclic | client-side topological-sort check |
| PC-3 | Every step's `run` references either a known agent task type OR an installed skill | client-side roster check |
| PC-4 | Symphony state-machine guarantees exactly-once step execution under retry | Symphony's existing semantics |
| PC-5 | Each pipeline run gets a `run_id` and persists step traces in Lago | Symphony → Lago integration |
| PC-6 | Failed steps under `on_failure: retry` honor an exponential backoff (max 3 retries unless overridden) | Symphony policy |
| PC-7 | Pipelines can be invoked **on-demand** OR **scheduled** (the `schedule:` field activates daemon-side scheduling) | daemon's existing cron pattern |

---

## 4. Gap catalog

What v0.4.4 lacks for each subcommand. Categorized by phase + severity.

### 4.1 Chat gaps (close in Phase A → v0.5.0)

| ID | Severity | Gap | Closure |
|---|---|---|---|
| 4.1.1 | Major | No CLI surface for `lifegw /agent/stream` | New `src/cli/chat.rs` |
| 4.1.2 | Major | No streaming TUI (no token-by-token render) | crossterm + tokio::select |
| 4.1.3 | Major | No session resumption across invocations | server-side state already exists; CLI needs `--session <id>` |
| 4.1.4 | Minor | No history list / search | `broomva chat sessions` + telemetry query |
| 4.1.5 | Minor | No model picker beyond config default | `--model <id>` flag + `broomva chat models` |

### 4.2 Agent gaps (close in Phase B → v0.6.0)

| ID | Severity | Gap | Closure |
|---|---|---|---|
| 4.2.1 | Blocker | No `lifed Agent.CreateSession` client in CLI | New `src/api/lifed.rs` |
| 4.2.2 | Major | No agent task spec schema | `schemas/agent-task.v1.json` |
| 4.2.3 | Major | No client-side cost ceiling enforcement | check before submit; lifed enforces at runtime |
| 4.2.4 | Major | No tool authorization plumbing in CLI | wire `policy.yaml`-style gates client-side |
| 4.2.5 | Minor | No agent templates ("hello world" task specs) | `broomva agent templates` + `./templates/` shipped |
| 4.2.6 | Minor | No `--watch` (currently `tail -f`-style would need polling) | use lifed's StreamSession events |

### 4.3 Pipeline gaps (close in Phase C → v0.7.0)

| ID | Severity | Gap | Closure |
|---|---|---|---|
| 4.3.1 | Blocker | No `Symphony /symphony/runs` POST client | extend `daemon/symphony_client.rs` |
| 4.3.2 | Blocker | No pipeline DSL parser | YAML → Rust struct via serde_yaml |
| 4.3.3 | Major | No `schemas/pipeline.v1.json` | new schema |
| 4.3.4 | Major | DAG cycle detection | petgraph or hand-rolled |
| 4.3.5 | Major | No scheduling integration (cron-style) | daemon's existing tasks module extends |
| 4.3.6 | Minor | No `--dry-run` (planning mode without execution) | client-side validation only |
| 4.3.7 | Minor | No live multi-step progress UI (gantt-like) | TUI polish, Phase C.1 |

### 4.4 Cross-cutting gaps

| ID | Severity | Gap | Closure |
|---|---|---|---|
| 4.4.1 | Major | All three need telemetry compatibility with existing `prompts` invocation model | shared `src/telemetry/invocation.rs` already exists; extend with `chat_invocation`, `agent_invocation`, `pipeline_invocation` types |
| 4.4.2 | Minor | All three need TUI primitives (streaming text, progress bars, tables) | shared `src/tui/` module |
| 4.4.3 | Minor | All three may need offline/replay mode for testing | env override `BROOMVA_OFFLINE_FIXTURES=path/` |
| 4.4.4 | Minor | All three should respect `--format json` for scripting | already a global flag; new subcommands must implement |

---

## 5. Target architecture

The closed-substrate state after Phase A + B + C ship.

### 5.1 New CLI surface

```
broomva chat [PROMPT]                          # interactive REPL or one-shot
broomva chat sessions [--json]                 # list past sessions
broomva chat resume <session-id>               # continue session
broomva chat models                            # list available models

broomva agent run <task-spec.yaml>             # submit + watch
broomva agent run --inline '<spec-json>'       # ephemeral spec
broomva agent list [--status running|completed|failed] [--json]
broomva agent get <run-id> [--json]            # status + output
broomva agent tail <run-id>                    # follow events stream
broomva agent cancel <run-id>
broomva agent templates                        # list shipped task templates
broomva agent templates show <name>            # print a template

broomva pipeline run <pipeline.yaml> [--dry-run] [--watch]
broomva pipeline list [--json]
broomva pipeline get <run-id> [--json]
broomva pipeline tail <run-id>                 # follow per-step events
broomva pipeline cancel <run-id>
broomva pipeline validate <pipeline.yaml>      # schema + DAG check, no submit
broomva pipeline schedule <pipeline.yaml>      # register cron via daemon
broomva pipeline schedule list / unschedule    # manage scheduled pipelines
```

### 5.2 Data flow (closed state)

```
┌──────────────┐
│   broomva    │  ──┬── chat ────────► lifegw /agent/stream ──► lifed ──► InferenceBackend
│     CLI      │    ├── agent ───────► lifed gRPC ─────────────► Spec D saga + Spec E
│              │    └── pipeline ────► Symphony REST ──┬──► many lifed sessions
└──────────────┘                                       └──► skill invocations
        │
        ▼
   ~/.broomva/
   ├── config.yaml
   ├── runs/<run_id>/
   │   ├── transcript.jsonl
   │   ├── output.json
   │   └── metadata.yaml
   └── sessions/<session_id>/
       └── history.jsonl
```

### 5.3 Visible output (target — `broomva chat` REPL)

```
$ broomva chat
  broomva chat v0.5.0 — claude-opus-4-7 [session: 01J9...]

? Plan the spec for the next phase of the substrate
  Phase 6 of substrate completion targets v0.9.0 — vendored upgrade ...
  ↑ streaming, ESC to interrupt, /save, /model, /history, /exit

>
```

### 5.4 Visible output (target — `broomva agent run`)

```
$ broomva agent run task.yaml --watch
  broomva agent — submitting task "summarize-pr-and-update-linear"
  → run_id: 01J9...
  → cost ceiling: $5.00
  → backend: claude-opus-4-7

  [00:00] queued
  [00:02] tool_call: github_read pr_url=...
  [00:08] tool_result: 12 commits, 47 files
  [00:15] reasoning: ...
  [00:21] tool_call: linear_write
  [00:24] tool_result: posted to BRO-1170
  [00:24] done — cost $0.18, transcript saved to ~/.broomva/runs/01J9.../

  output: { summary: "...", decision_log: [...] }
```

### 5.5 Visible output (target — `broomva pipeline run`)

```
$ broomva pipeline run weekly-update.yaml --watch
  broomva pipeline — "weekly-stakeholder-update"
  → run_id: 01J9...
  → 5 steps, 1 parallel fanout

  [00:00] gather-linear        ━━━━━━━━━━ done (3.2s)
  [00:00] gather-prs           ━━━━━━━━━━ done (4.1s)
  [00:04] synthesize           ━━━━━━━━━━ done (12.3s)
  [00:17] draft-update         ━━━━━━━━━━ done (8.7s)
  [00:25] deliver              ━━━━━━━━━━ done (2.1s)

  pipeline complete in 27.4s, cost $0.42
```

---

## 6. Closure phases (work breakdown)

Phases ordered by dependency. Each is a single PR (or small sequence) and bumps the version per the release contract.

### Phase A — `broomva chat` (target: v0.5.0)

**Scope**: bring interactive agent conversation to the CLI via lifegw streaming.

**Deliverables**:

- **NEW** `src/cli/chat.rs` (~400 LOC) — REPL + one-shot + sessions + resume + models
- **NEW** `src/api/agent_stream.rs` — WebSocket client for `lifegw /agent/stream` with reconnect-by-last_seq
- **NEW** `src/tui/` shared module — typewriter renderer, ESC interrupt, slash commands
- **NEW** `~/.broomva/sessions/<id>/history.jsonl` — local mirror of multi-turn history
- **EDIT** `src/cli/mod.rs` — register `chat` subcommand
- **EDIT** `Cargo.toml` — add `tokio-tungstenite`, `crossterm`, `rustyline`
- **NEW** `tests/chat_smoke.rs` — fixture-based: mock lifegw, assert REPL state transitions
- **EDIT** `VERSION` → `0.5.0`
- **EDIT** `CHANGELOG.md`

**Slash commands inside the REPL**: `/save`, `/model <id>`, `/history`, `/clear`, `/exit`, `/help`.

**SLO targets**:

- One-shot `broomva chat "hi"` p99 < 5s end-to-end (cold)
- Per-token render latency p99 < 50ms (perceived as "fluid streaming")
- Resume `broomva chat resume <id>` p99 < 1s to first new token

**Risks + mitigations**:

- Risk: WebSocket reconnect storms on flaky networks → mitigation: jittered exponential backoff per Spec C₃ §6.6.
- Risk: TUI blocks on slow tokens → mitigation: dedicated render task, mpsc channel from WS reader.
- Risk: History grows unbounded → mitigation: per-session JSONL files; archive at 10 MB; user-visible `broomva chat sessions prune --older-than 30d`.

**Linear**: BRO-1168 → child issue per phase to be created on spec ratification.

### Phase B — `broomva agent` (target: v0.6.0)

**Scope**: typed agent task invocation via lifed, with structured output + cost ceilings + tool auth.

**Deliverables**:

- **NEW** `src/cli/agent.rs` (~500 LOC) — `run`, `list`, `get`, `tail`, `cancel`, `templates`
- **NEW** `src/api/lifed.rs` — gRPC client for `lifed Agent.CreateSession` + `StreamSession` (via `tonic` with `tonic-web` fallback for non-HTTP/2 environments)
- **NEW** `schemas/agent-task.v1.json` — task spec schema, validated client-side before submit
- **NEW** `templates/` directory with starter tasks: `hello.task.yaml`, `summarize-pr.task.yaml`, `update-linear.task.yaml`, `daily-briefing.task.yaml`
- **NEW** `src/api/output_validator.rs` — post-run validation of output against task spec's `output.schema`
- **NEW** `~/.broomva/runs/<run_id>/` filesystem layout (transcript.jsonl, output.json, metadata.yaml)
- **EDIT** `src/cli/mod.rs` — register `agent` subcommand
- **EDIT** `Cargo.toml` — add `tonic`, `prost`, `serde_yaml`, `jsonschema`
- **NEW** `tests/agent_task_validation.rs` — fixture specs valid + invalid → expected verdicts
- **EDIT** `VERSION` → `0.6.0`
- **EDIT** `CHANGELOG.md`

**Cost ceiling enforcement**: client-side `--max-cost` flag overrides spec; client refuses to submit if estimated cost > cap. lifed enforces at runtime via wallet check (Spec D Wallet.Transfer simulation).

**SLO targets**:

- `broomva agent run <task>` submit-to-queued p99 < 2s
- `broomva agent tail <run-id>` first-event-to-render p99 < 500ms
- `broomva agent list` (50 runs) p99 < 1s

**Risks + mitigations**:

- Risk: Long-running task hits `timeout_seconds` → mitigation: task spec declares `on_timeout: fail | partial-output | retry`.
- Risk: Output schema validation rejects valid-looking output → mitigation: `--skip-output-validation` escape hatch; verdict logged to run metadata.
- Risk: Tool authorization gaps (e.g. tool tries write where read was approved) → mitigation: per-tool scope tokens via Spec D AnimaCustody; lifed mints scoped capability per tool call.

**Linear**: child of BRO-1168.

### Phase C — `broomva pipeline` (target: v0.7.0)

**Scope**: declarative multi-step composition with Symphony orchestration.

**Deliverables**:

- **NEW** `src/cli/pipeline.rs` (~600 LOC) — `run`, `list`, `get`, `tail`, `cancel`, `validate`, `schedule [list|unschedule]`
- **EDIT** `src/daemon/symphony_client.rs` — extend with `submit_run`, `cancel_run`, `list_runs`, `tail_events` (today it's read-only state)
- **NEW** `schemas/pipeline.v1.json` — pipeline definition schema with cycle-detection invariant
- **NEW** `src/pipeline/parser.rs` — YAML → typed pipeline struct + DAG validator
- **NEW** `src/pipeline/scheduler.rs` — wire pipeline.schedule cron → daemon tasks module
- **NEW** `templates/pipelines/` — `weekly-update.pipeline.yaml`, `pr-review-fanout.pipeline.yaml`
- **EDIT** `src/cli/mod.rs` — register `pipeline` subcommand
- **EDIT** `Cargo.toml` — add `petgraph` (DAG ops), `cron` (scheduling)
- **NEW** `tests/pipeline_validation.rs` — happy path + 5 failure modes (cycle, missing dep, unknown step, schedule format, file not found)
- **EDIT** `VERSION` → `0.7.0`
- **EDIT** `CHANGELOG.md`

**Schedule integration**: when a pipeline file has `schedule: "<cron>"`, `broomva pipeline schedule <file>` registers it as a daemon task. `broomva daemon tasks` lists scheduled pipelines alongside sensors. The daemon submits runs at cron times.

**SLO targets**:

- `broomva pipeline validate <file>` p99 < 100ms (client-side only)
- `broomva pipeline run <file>` submit-to-queued p99 < 3s
- `broomva pipeline tail` per-step event latency p99 < 1s

**Risks + mitigations**:

- Risk: Long pipelines crash mid-run, partial state in Lago → mitigation: Symphony's existing saga-restart semantics + `broomva pipeline get` shows resumable steps.
- Risk: Schedule conflicts (two pipelines on the same minute) → mitigation: daemon serializes pipeline submissions; UI surfaces backlog.
- Risk: DSL drift (YAML keys renamed mid-release) → mitigation: `schemas/pipeline.v1.json` is the canonical contract; migrations in `scripts/migrate-pipeline.sh`.

**Linear**: child of BRO-1168.

### Phase D — telemetry + replay polish (target: v0.7.1, optional)

**Scope**: smooth rough edges across all three subcommands.

**Deliverables**:

- Telemetry beacons for chat / agent / pipeline (mirroring `prompts pull` → `complete` → `feedback` shape) so the broomva.tech telemetry plane sees them
- `BROOMVA_OFFLINE_FIXTURES=path/` env to replay deterministic transcripts in CI without network
- `broomva runs export <run_id>` — bundle transcript + metadata as a tarball for sharing / postmortem
- `broomva chat / agent / pipeline --format json` consistent shape across all three (cross-subcommand schema)

**Defer if**: telemetry coverage feels sufficient after Phases A-C; this is polish.

---

## 7. Test plan

Per-phase test plans live in §6. Cross-cutting strategy:

### 7.1 Fixture-based tests (no live infra)

- Mock lifegw via wiremock for chat
- Mock lifed via in-process gRPC server for agent
- Mock Symphony REST via wiremock for pipeline
- Fixture transcripts in `tests/fixtures/transcripts/` — replayable JSON Lines
- All three subcommands gain a `--api-base=http://localhost:<port>` mode (already a global flag) for fixture testing

### 7.2 Live integration tests (gated behind env)

`BROOMVA_LIVE_INTEGRATION=1` enables tests that:

- Spin up a local lifed + lifegw via `core/life/scripts/dev-up.sh` (assumed to exist or to be added under Spec D-Sub-E)
- Run a real `broomva chat "hi"` against the local lifegw
- Run a real `broomva agent run hello.task.yaml` against the local lifed
- Run a real `broomva pipeline run hello-pipeline.yaml` against local Symphony

Live tests are excluded from default CI; manual run via `make integration-test`.

### 7.3 Determinism + replay

- `--seed <int>` flag for `broomva chat` and `broomva agent run` (passed through to inference backend) enables byte-identical reruns for fixture generation.

---

## 8. Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| lifegw `/agent/stream` interface changes mid-spec | Medium | Major | Pin to Spec C₃ §6.5 close codes + version-negotiate via WS subprotocol |
| lifed gRPC schema breaks across versions | Low | Major | Spec D's Proto3 contract is frozen at v1; CLI pins to v1 |
| Symphony REST shape drifts | Medium | Major | Add `Symphony-Version` header; CLI errors loudly on mismatch |
| Pipeline DSL ergonomics get rejected by users | Medium | Minor | Ship templates; collect feedback via `broomva pipeline feedback`; v0.7.1 polish PR |
| Cost ceiling enforcement leaks (run exceeds cap) | Low | Critical | Belt-and-suspenders: client-side estimate + lifed wallet check + post-run audit |
| Multi-turn chat history grows unbounded on disk | Medium | Minor | Per-session JSONL cap at 10MB; user-visible prune command |
| CLI dependencies (tokio-tungstenite, tonic) bloat binary size | Medium | Minor | Measure before/after; rustls keeps openssl out of the dep tree (already done in v0.4.3) |
| Test suite explosion (3 subcommands × N modes × fixtures) | High | Major | Shared fixture library at `tests/fixtures/`; per-mode test runs cap at 30s in CI |
| Schema versioning forks user state | Low | Major | `schemas/agent-task.v1.json` + `pipeline.v1.json` follow the same v1 → v2 migration pattern as bstack |

---

## 9. Out of scope

The following are **not** part of these three subcommands:

- **New runtime infrastructure.** Phases A/B/C are pure CLI work — they compose existing lifed + lifegw + Symphony + Spec E surfaces. No new daemon, no new gateway, no new proto.
- **ChatOS UI redesign.** The browser/desktop chat product at `apps/chatOS/` is separate; `broomva chat` is its CLI complement, not its replacement.
- **New skill catalog.** `broomva skills install` already exists; the three new subcommands consume the existing skills.
- **Web-based pipeline editor.** Pipelines are YAML files in v0.7.0; a visual editor could come post-1.0.
- **Multi-user / org-level RBAC for pipelines.** Spec D AnimaCustody is per-user today; cross-user pipelines are a future concern.
- **Cron-style scheduling for chat / agent.** Only `pipeline` accepts a `schedule:` field. One-shot agent runs can be cron'd via the user's OS-level cron + `broomva agent run`.

---

## 10. Open questions

1. **Default model for `broomva chat`.** Use the user's `~/.broomva/config.yaml` default? Or per-session pick? Default: config; flag override.
2. **`broomva agent run` — synchronous default or async default?** Synchronous (= submit + watch + block) is more shell-script friendly; async (= submit + print run_id) is more pipeline-friendly. Lean: synchronous by default, `--detach` for async.
3. **Pipeline DSL: YAML vs TOML vs JSON.** Lean YAML (human-friendly, comments, multi-line strings). Validate via schema; convert to TOML on demand if Cargo ecosystem prefers it.
4. **Skill invocation as pipeline step type.** Should `run: stakeholder_update` (skill name) be sugar for `run: skill` + `name: stakeholder_update`? Lean: yes for ergonomic shortcuts; skills are first-class.
5. **Cost / budget plane.** Per-run cap is in Agent Invocation Contract. Should there also be a per-user **daily** cap surfaced by `broomva config`? Probably yes, but defer to Phase D.
6. **Resumable pipelines.** If a pipeline step fails mid-run, `broomva pipeline resume <run_id>` is the natural verb. Defer to Phase C.1 or push into Phase C if Symphony supports it natively.
7. **Offline / air-gapped mode.** Some users run on machines without internet during certain hours. `--offline` could enqueue runs locally and submit when network returns. Defer to v1.x.
8. **Conflict between `broomva chat` and `chatOS`.** Same user, two surfaces. Should sessions be cross-visible (start in CLI, continue in ChatOS)? Lean: yes, via the existing session-store backing lifegw. Implementation deferred to a UX phase.

---

## 11. Glossary

- **Chat session** — a single bidirectional WS connection to `lifegw /agent/stream`, scoped to one user + one agent loop.
- **Agent invocation** — a single typed task submitted via `lifed Agent.CreateSession`, with structured input/output and lifecycle events.
- **Pipeline** — a DAG of agent invocations + skill calls orchestrated by Symphony.
- **lifegw** — the L0 edge gateway (Spec C₃); authenticates, terminates TLS, multiplexes WebSocket streams to lifed.
- **lifed** — the facade daemon (Spec D); coordinates Anima identity, Lago artifact storage, Wallet, and InferenceBackend per session.
- **Symphony** — the orchestration daemon at `~/broomva/core/symphony/`; runs pipelines as state machines.
- **InferenceBackend** — the per-call compute interface (Spec E); kv-cache-aware, model-agnostic, runs in the same daemon as lifed.
- **AnimaCustody** — per-user identity (Spec D); auth + wallet keys held by an oracle (passkey, TPM, KMS, etc.).
- **Lago** — content-addressed blob store + event log; persists session transcripts + pipeline traces.
- **invocation_id** — ULID issued per `chat session` / `agent run` / `pipeline run`; consistent across `broomva prompts feedback`.
- **run_id** — same identifier under a different name for agent + pipeline (matches lifed/Symphony conventions).
- **Spec C₃** — Life Agent OS gateway/streaming spec.
- **Spec D** — AnimaCustody multi-backend identity spec.
- **Spec E** — InferenceBackend agent-loop-silicon contract.

---

## Appendix A — Subcommand surface summary

```
broomva chat [PROMPT] [--session <id>] [--model <id>] [--format <table|json>]
broomva chat sessions [--json]
broomva chat resume <session-id>
broomva chat models

broomva agent run <task-spec.yaml> [--watch] [--detach] [--max-cost <usd>] [--seed <int>]
broomva agent run --inline '<spec-json>'
broomva agent list [--status running|completed|failed] [--limit N] [--json]
broomva agent get <run-id> [--json]
broomva agent tail <run-id>
broomva agent cancel <run-id>
broomva agent templates [list|show <name>]

broomva pipeline run <pipeline.yaml> [--dry-run] [--watch]
broomva pipeline list [--json]
broomva pipeline get <run-id> [--json]
broomva pipeline tail <run-id>
broomva pipeline cancel <run-id>
broomva pipeline validate <pipeline.yaml>
broomva pipeline schedule <pipeline.yaml>
broomva pipeline schedule list
broomva pipeline schedule unschedule <name-or-id>
```

## Appendix B — Implementation order summary

```
Phase A — broomva chat (lifegw streaming)          → v0.5.0
Phase B — broomva agent (lifed task invocation)    → v0.6.0
Phase C — broomva pipeline (Symphony orchestrator) → v0.7.0
Phase D — telemetry + replay polish (optional)     → v0.7.1
```

Cadence: ≈ 1 release per 1-2 weeks. The cost of each phase is dominated by the **runtime contract integration** (WS for A, gRPC for B, Symphony REST for C), not the CLI surface itself.

## Appendix C — Naming registry (reserved subcommand surface)

Per the same convention bstack uses (substrate completion spec Appendix C). New entries added by this spec:

| Subcommand | Status | Owner |
|---|---|---|
| `chat` | Phase A | runtime (lifegw streaming) |
| `agent` | Phase B | runtime (lifed task invocation) |
| `pipeline` | Phase C | orchestration (Symphony) |
| `runs` (cross-subcommand `broomva runs export`) | Phase D | telemetry |

Subcommands SHALL NOT be added outside the existing registry + this spec's additions without a CHANGELOG entry referencing this doc.

---

## Closing notes

This spec is deliberately conservative: it composes the existing Life Agent OS surfaces (lifegw, lifed, Symphony, Spec E InferenceBackend) rather than introducing new runtime infrastructure. The three subcommands are the **interactive face** of the substrate — they don't change the substrate's shape, they just expose it through the CLI in a way that the broomva.tech dashboard and ChatOS already do for their respective audiences.

The closure cadence (3 phases × 1-2 weeks each) keeps each PR reviewable and reversible. None of the three subcommands depend on the others; if Phase A reveals API limitations, B and C can absorb the lessons before they ship.

The cost of getting this right is high — these subcommands become how users interact with the substrate from the terminal, which is the dominant interface for the developer audience. The cost of getting it wrong is also high (CLI surfaces are sticky; once `broomva agent run` is documented, renaming it is painful). The spec exists to make the design decisions deliberate, not emergent.
