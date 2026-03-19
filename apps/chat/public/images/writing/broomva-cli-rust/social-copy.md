# Social Distribution — "One Binary to Rule Them All"

## X Thread (7 tweets)

### 1/7 — Hook
Replaced a Node.js CLI with 3.7MB of Rust.

One command now installs the binary, 24 agent skills, and a monitoring daemon.

`cargo install broomva`

Here's why and how 👇

### 2/7 — The Problem
The old @broomva/cli needed Node.js installed, loaded a JS runtime on every call, and ran a monitoring daemon with setInterval.

Meanwhile the entire Agent OS stack (Symphony, Arcan, Lago) is Rust.

The CLI was the odd one out.

### 3/7 — What It Does
Six command groups covering the full broomva.tech API:

• auth — device code OAuth flow
• prompts — CRUD + pull/push with frontmatter
• skills — browse and install 24 bstack skills
• context — project conventions & stack
• config — backward-compatible with the TS CLI
• daemon — async heartbeat + Axum dashboard

### 4/7 — Zero Migration
The TS CLI writes ~/.broomva/config.json with camelCase keys.

One serde attribute makes Rust read the same file:

#[serde(rename_all = "camelCase")]

Both CLIs share the same config. No migration. No breakage.

### 5/7 — The Daemon
tokio::select! with CancellationToken replaces setInterval.

Three sensors poll site health, API health, and Railway services. State shared via Arc<RwLock<>> between the heartbeat loop and an Axum dashboard on :7890.

Proper signal handling. Proper async.

### 6/7 — One Install Command
curl -fsSL https://broomva.tech/api/install | bash

This installs:
1. The broomva binary (cargo or pre-built)
2. The broomva.tech skill
3. bstack — all 24 agent skills across 7 layers

Full stack from one curl.

### 7/7 — Ship It
34 files. 5,914 lines of Rust. Published to crates.io as v0.1.0 in a single session.

Blog post: https://broomva.tech/writing/one-binary-to-rule-them-all
Source: https://github.com/broomva/broomva.tech/tree/main/crates/broomva-cli
Install: cargo install broomva

---

## LinkedIn Post

### One Binary to Rule Them All

Shipped a Rust CLI that replaces a Node.js package, monitors infrastructure, and installs 24 agent skills — all from a 3.7MB binary.

The old CLI needed a JS runtime. The new one is a single static binary that follows the same patterns as the rest of the Agent OS stack: clap for parsing, reqwest for HTTP, axum for the dashboard server, tokio for async.

Key decisions that kept it simple:
• Single crate, not a workspace — four concerns don't need eight crates
• No dependency on symphony-core or aios-protocol — pure HTTP client
• Backward-compatible config — one serde attribute reads the existing JSON
• One install command — curl installs the binary + 24 skills

The numbers: 34 files, 5,914 lines of Rust, 3.7MB stripped binary, 0 clippy warnings, published to crates.io in the same session it was written.

Install it: cargo install broomva
Full post: https://broomva.tech/writing/one-binary-to-rule-them-all

#Rust #CLI #OpenSource #AgentOS #DevTools

---

## Image Assets

- Social card: `/images/writing/broomva-cli-rust/social-card.png` (1200x1200)
  Use for X thread image on tweet 1/7 and LinkedIn post header
