//! `broomva chat` — Phase A REPL implementing the Chat Session
//! Contract (CC-1..CC-5) from
//! `docs/specs/2026-05-18-broomva-cli-agent-chat-pipeline.md` §3.1.
//!
//! Three entry points:
//!
//! 1. **One-shot** — `broomva chat "<prompt>"` — submits a single
//!    turn, streams the reply to stdout, exits.
//! 2. **Interactive** — `broomva chat` (no args) — opens the REPL.
//! 3. **Resume** — `broomva chat resume <session-id>` — replays the
//!    on-disk history.jsonl, reconnects to the gateway with
//!    `from_sequence`, opens the REPL.
//!
//! Plus session-management subcommands (`sessions list`, `sessions
//! prune`, `models`).

use std::fs::{self, File, OpenOptions};
use std::io::{BufRead, BufReader, BufWriter, Write};
use std::path::{Path, PathBuf};
use std::time::Duration;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::api::agent_stream::{self, AgentStream, AgentStreamConfig, OutboundFrame, StreamEvent};
use crate::config::constants::config_dir;
use crate::config::read_config;
use crate::error::{BroomvaError, BroomvaResult};
use crate::tui::{Renderer, SlashCommand, SlashCommandParseError, StdoutRenderer};

/// Default model when none is set on the command line OR in
/// `~/.broomva/config.json` `defaultModel`. Picked to match the
/// workspace's current knowledge-cutoff (`claude-sonnet-4-6`) per
/// the parent agent's directive.
const DEFAULT_MODEL: &str = "claude-sonnet-4-6";

/// Curated list of known models surfaced by `broomva chat models`.
/// Static for Phase A — Phase B will fetch live from lifed.
const KNOWN_MODELS: &[&str] = &["claude-sonnet-4-6", "claude-opus-4-7", "claude-haiku-4-5"];

/// Per-session JSONL cap before we roll the file (spec §6 Phase A
/// risks). 10 MB. Phase A only warns; rollover lands in Phase D.
const HISTORY_SIZE_WARN_BYTES: u64 = 10 * 1024 * 1024;

/// Default prune threshold for `chat sessions prune`. 30 days matches
/// the spec risk-mitigation language.
pub const DEFAULT_PRUNE_DAYS: u64 = 30;

// ── On-disk history shape ────────────────────────────────────────────

/// One JSON object per line in `history.jsonl`. Shape is stable for
/// Phase A → Phase B; Phase B may add a `cost_usd` field which the
/// Phase A parser accepts via `#[serde(default)]`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryEntry {
    pub role: HistoryRole,
    pub content: String,
    pub ts: DateTime<Utc>,
    pub model: Option<String>,
    pub session_id: String,
    pub seq: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum HistoryRole {
    User,
    Assistant,
    System,
}

// ── Public dispatch (called from cli/mod.rs) ─────────────────────────

/// One-shot mode: send `prompt`, stream reply, exit.
pub async fn handle_one_shot(opts: ChatRunOpts) -> BroomvaResult<()> {
    let prompt = opts.prompt.clone().unwrap_or_default();
    if prompt.is_empty() {
        return Err(BroomvaError::User(
            "chat one-shot requires a prompt argument".into(),
        ));
    }
    let mut session = ChatSession::new(opts, None)?;
    session.run_one_shot(&prompt).await
}

/// Interactive mode: open a new session and drop into the REPL.
pub async fn handle_interactive(opts: ChatRunOpts) -> BroomvaResult<()> {
    let mut session = ChatSession::new(opts, None)?;
    session.run_repl().await
}

/// Resume mode: load existing session, replay history to user, open REPL.
pub async fn handle_resume(opts: ChatRunOpts, session_id: String) -> BroomvaResult<()> {
    let history = load_history(&session_id)?;
    let mut session = ChatSession::new(opts, Some(session_id))?;
    session.print_replay(&history);
    session.set_resume_sequence(history.iter().map(|e| e.seq).max());
    session.run_repl().await
}

/// `broomva chat sessions` — list session IDs + first-line + last-modified.
pub fn handle_list_sessions() -> BroomvaResult<()> {
    let sessions_dir = sessions_dir();
    if !sessions_dir.exists() {
        println!("  no sessions yet — start one with `broomva chat`");
        return Ok(());
    }
    let mut entries: Vec<_> = fs::read_dir(&sessions_dir)?
        .filter_map(|r| r.ok())
        .filter(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false))
        .collect();
    entries.sort_by_key(|e| {
        e.metadata()
            .and_then(|m| m.modified())
            .unwrap_or(std::time::SystemTime::UNIX_EPOCH)
    });
    entries.reverse();
    println!("  {} sessions", entries.len());
    for entry in entries {
        let id = entry.file_name().to_string_lossy().to_string();
        let history_path = entry.path().join("history.jsonl");
        let modified = entry
            .metadata()
            .and_then(|m| m.modified())
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| {
                DateTime::<Utc>::from_timestamp(d.as_secs() as i64, 0)
                    .map(|dt| dt.format("%Y-%m-%d %H:%M").to_string())
                    .unwrap_or_default()
            })
            .unwrap_or_else(|| "?".into());
        let preview = first_user_line(&history_path).unwrap_or_default();
        println!("    {id}  {modified}  {preview}");
    }
    Ok(())
}

/// `broomva chat sessions prune --older-than 30d` — remove sessions
/// whose `history.jsonl` mtime is older than `older_than_days`.
pub fn handle_prune_sessions(older_than_days: u64, dry_run: bool) -> BroomvaResult<()> {
    let sessions_dir = sessions_dir();
    if !sessions_dir.exists() {
        println!("  no sessions dir yet — nothing to prune");
        return Ok(());
    }
    let threshold =
        std::time::SystemTime::now() - Duration::from_secs(older_than_days.saturating_mul(86_400));
    let mut removed = 0_usize;
    let mut kept = 0_usize;
    for entry in fs::read_dir(&sessions_dir)? {
        let Ok(entry) = entry else { continue };
        if !entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            continue;
        }
        let mtime = entry
            .metadata()
            .and_then(|m| m.modified())
            .unwrap_or(std::time::SystemTime::UNIX_EPOCH);
        if mtime < threshold {
            let path = entry.path();
            let id = entry.file_name();
            if dry_run {
                println!("    would prune {}", id.to_string_lossy());
            } else {
                fs::remove_dir_all(&path)?;
                println!("    pruned {}", id.to_string_lossy());
            }
            removed += 1;
        } else {
            kept += 1;
        }
    }
    if dry_run {
        println!("  dry-run: {removed} session(s) would be pruned, {kept} kept");
    } else {
        println!("  pruned {removed} session(s), {kept} kept");
    }
    Ok(())
}

/// `broomva chat models` — print the curated list. Phase B will fetch
/// live from lifed.
pub fn handle_models() -> BroomvaResult<()> {
    println!("  Available models (Phase A — curated list):");
    for m in KNOWN_MODELS {
        let marker = if *m == DEFAULT_MODEL {
            " (default)"
        } else {
            ""
        };
        println!("    {m}{marker}");
    }
    println!("  Override default via `broomva config set default_model <id>` or `--model <id>`.");
    Ok(())
}

// ── ChatRunOpts — flag/env/config resolution ─────────────────────────

/// Inputs the dispatcher passes from `cli::mod.rs` after merging the
/// `clap`-parsed flags. The CLI flag overrides everything; the env
/// var is the second-most-specific; the on-disk config is the
/// fallback. Empty / missing ⇒ build-time defaults.
#[derive(Debug, Clone)]
pub struct ChatRunOpts {
    pub prompt: Option<String>,
    pub session_id: Option<String>,
    pub model: Option<String>,
    pub gateway_url: Option<String>,
    pub token_override: Option<String>,
    /// Extra root CA cert path (BRO-1186). When set, appended to the
    /// TLS trust store for the WS handshake; falls back to
    /// `BROOMVA_CA_CERT` env var inside `resolve`. None ⇒ production
    /// CAs only.
    pub ca_cert_path: Option<String>,
    /// `user_id` for the lifegw `create_chat_session` body (BRO-1189).
    /// MUST match the bearer's `sub` claim. Resolved in `resolve()`
    /// via flag → env → token-derived → fallback.
    pub user_id_override: Option<String>,
    /// `project_id` for the lifegw `create_chat_session` body
    /// (BRO-1189). Resolved in `resolve()` via flag → env → config →
    /// default (`default`).
    pub project_id_override: Option<String>,
}

impl ChatRunOpts {
    /// Materialize the final `AgentStreamConfig` from layered sources.
    pub fn resolve(&self, session_id_override: Option<&str>) -> BroomvaResult<AgentStreamConfig> {
        let cfg = read_config().ok();

        // gateway_url: flag → env → config → default.
        let gateway_url = self
            .gateway_url
            .clone()
            .or_else(|| {
                std::env::var("BROOMVA_GATEWAY_URL")
                    .ok()
                    .filter(|s| !s.is_empty())
            })
            .or_else(|| {
                cfg.as_ref().and_then(|c| {
                    // Allow either `gatewayUrl` field on the config —
                    // we widen via serde_json::Value to avoid a
                    // breaking change to `CliConfig` for Phase A. The
                    // Phase B PR will type this properly.
                    let val = serde_json::to_value(c).ok()?;
                    val.get("gatewayUrl")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string())
                })
            })
            .unwrap_or_else(|| agent_stream::DEFAULT_GATEWAY_URL.to_string());

        // model: flag → env → config → default.
        let model = self
            .model
            .clone()
            .or_else(|| {
                std::env::var("BROOMVA_MODEL")
                    .ok()
                    .filter(|s| !s.is_empty())
            })
            .or_else(|| {
                cfg.as_ref().and_then(|c| {
                    let val = serde_json::to_value(c).ok()?;
                    val.get("defaultModel")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string())
                })
            })
            .or_else(|| Some(DEFAULT_MODEL.to_string()));

        // token: flag → env → config.
        let token = self
            .token_override
            .clone()
            .or_else(|| {
                std::env::var("BROOMVA_TOKEN")
                    .ok()
                    .filter(|s| !s.is_empty())
            })
            .or_else(|| cfg.as_ref().and_then(|c| c.token.clone()));

        let session_id = session_id_override
            .map(|s| s.to_string())
            .or_else(|| self.session_id.clone());

        // BRO-1186 — flag wins, env fallback inside the helper. The
        // resolver returns `None` when neither is set, which keeps the
        // production CA-only behaviour intact.
        let ca_cert_path = crate::api::tls::resolve_ca_cert_path(self.ca_cert_path.as_deref());

        // BRO-1189 — user_id resolved flag → env → token-derived →
        // sentinel default. The dev-token shortcut
        // `dev-token-for-{user_id}` is the source of truth in
        // lumen-smoke; real JWS tokens carry `sub` in the payload but
        // we keep parsing out of scope for B.1 (caller must supply
        // `--user` or `BROOMVA_USER_ID` when the token isn't a dev
        // shortcut).
        let user_id = self
            .user_id_override
            .clone()
            .or_else(|| {
                std::env::var("BROOMVA_USER_ID")
                    .ok()
                    .filter(|s| !s.is_empty())
            })
            .or_else(|| token.as_ref().and_then(|t| derive_user_id_from_token(t)))
            .unwrap_or_else(|| "default-user".to_string());

        // BRO-1189 — project_id resolved flag → env → config → default.
        let project_id = self
            .project_id_override
            .clone()
            .or_else(|| {
                std::env::var("BROOMVA_PROJECT_ID")
                    .ok()
                    .filter(|s| !s.is_empty())
            })
            .or_else(|| {
                cfg.as_ref().and_then(|c| {
                    let val = serde_json::to_value(c).ok()?;
                    val.get("projectId")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string())
                })
            })
            .unwrap_or_else(|| agent_stream::DEFAULT_PROJECT_ID.to_string());

        Ok(AgentStreamConfig {
            gateway_url,
            token,
            session_id,
            from_sequence: None,
            model,
            user_id,
            project_id,
            resume_existing_sid: None,
            connect_timeout: Duration::from_secs(15),
            ca_cert_path,
        })
    }
}

/// Best-effort extraction of `user_id` from a bearer token (BRO-1189).
///
/// Two paths:
/// * Dev shortcut: `dev-token-for-<user_id>` → return `<user_id>`.
/// * Real JWS: best-effort decode of the middle segment, look up
///   `sub`. Failure returns `None` — caller falls back to flag /
///   env / sentinel.
pub fn derive_user_id_from_token(token: &str) -> Option<String> {
    if let Some(user) = token.strip_prefix("dev-token-for-")
        && !user.is_empty()
    {
        return Some(user.to_string());
    }
    // Real JWS — base64url-decode the middle segment and parse `sub`.
    let mut segs = token.split('.');
    let _header = segs.next()?;
    let body_b64 = segs.next()?;
    let _sig = segs.next()?;
    // base64url no-pad decoder. Use the `base64` crate? Avoid: keep
    // the helper dep-free. Pad manually.
    let mut padded = body_b64.replace('-', "+").replace('_', "/");
    while padded.len() % 4 != 0 {
        padded.push('=');
    }
    let decoded = base64_decode_strict(&padded)?;
    let value: serde_json::Value = serde_json::from_slice(&decoded).ok()?;
    value
        .get("sub")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
}

/// Standard base64 decoder shared with `derive_user_id_from_token`.
/// Pulled into a helper so the test surface can verify it directly
/// without going through the full token path.
fn base64_decode_strict(s: &str) -> Option<Vec<u8>> {
    // Use the rustls/reqwest-already-pulled base64 indirectly: we
    // re-use `rustls_pemfile`'s internal base64 isn't public, so
    // bring in a tiny inline decoder. Avoids a new dep.
    // Map base64 alphabet → 6-bit value.
    let mut out = Vec::with_capacity(s.len() * 3 / 4);
    let mut buf: u32 = 0;
    let mut bits: u32 = 0;
    for c in s.bytes() {
        let v = match c {
            b'A'..=b'Z' => c - b'A',
            b'a'..=b'z' => 26 + (c - b'a'),
            b'0'..=b'9' => 52 + (c - b'0'),
            b'+' => 62,
            b'/' => 63,
            b'=' => break,
            _ => return None,
        };
        buf = (buf << 6) | u32::from(v);
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((buf >> bits) as u8);
            buf &= (1 << bits) - 1;
        }
    }
    Some(out)
}

// ── ChatSession — the REPL state machine ─────────────────────────────

/// Owns the renderer, the history-file writer, and connection
/// parameters. Drives one or more turns end-to-end.
pub struct ChatSession {
    opts: ChatRunOpts,
    session_id: String,
    history_path: PathBuf,
    /// Renderer used for streaming output. Tests can swap this.
    renderer: Box<dyn Renderer>,
    /// Latest sequence seen from the gateway (drives reconnect-by-last-seq).
    last_seq: Option<u64>,
    /// Model currently in effect (mutable via `/model`).
    current_model: Option<String>,
}

impl ChatSession {
    /// Build a session with a stdout renderer; chooses a new ULID when
    /// `existing_session_id` is `None`.
    pub fn new(opts: ChatRunOpts, existing_session_id: Option<String>) -> BroomvaResult<Self> {
        let session_id = existing_session_id.unwrap_or_else(new_session_id);
        let history_path = session_history_path(&session_id);
        if let Some(parent) = history_path.parent() {
            fs::create_dir_all(parent)?;
        }
        let current_model = opts.model.clone();
        Ok(Self {
            opts,
            session_id,
            history_path,
            renderer: Box::new(StdoutRenderer::default()),
            last_seq: None,
            current_model,
        })
    }

    /// Override the renderer (used by `tests/chat_smoke.rs` and any
    /// caller that wants to capture output programmatically).
    pub fn with_renderer(mut self, renderer: Box<dyn Renderer>) -> Self {
        self.renderer = renderer;
        self
    }

    /// Tell the session to start reconnect-by-last-seq from this point.
    pub fn set_resume_sequence(&mut self, seq: Option<u64>) {
        self.last_seq = seq;
    }

    /// Re-emit prior history to stdout when resuming.
    pub fn print_replay(&mut self, history: &[HistoryEntry]) {
        let _ = self.renderer.write_notice(&format!(
            "resuming session {} ({} prior turn(s))",
            self.session_id,
            history
                .iter()
                .filter(|e| e.role == HistoryRole::User)
                .count()
        ));
        for entry in history {
            let prefix = match entry.role {
                HistoryRole::User => "?",
                HistoryRole::Assistant => " ",
                HistoryRole::System => "!",
            };
            let _ = self
                .renderer
                .write_token(&format!("{prefix} {}\n", entry.content));
        }
    }

    /// Run one-shot: connect, send a single turn, stream the reply
    /// until `TurnComplete` or `Closed`, exit.
    pub async fn run_one_shot(&mut self, prompt: &str) -> BroomvaResult<()> {
        let cfg = self.opts.resolve(Some(&self.session_id))?;
        let mut stream = agent_stream::connect(cfg).await?;
        self.send_turn(&mut *stream, prompt).await?;
        self.drain_until_turn_end(&mut *stream).await?;
        let _ = stream.close().await;
        Ok(())
    }

    /// Run interactive REPL until `/exit` or EOF on stdin.
    pub async fn run_repl(&mut self) -> BroomvaResult<()> {
        // We open a fresh connection per REPL session and reuse it
        // across turns. Reconnect-by-last-seq is driven by lower
        // layers in `agent_stream::spawn_driver` (Phase B follow-up
        // — Phase A keeps a single connection per turn for simplicity
        // and lets the user resume via `chat resume <id>`).
        self.print_repl_banner();

        let mut rl = build_rustyline_editor();
        let _ = rl.load_history(&rustyline_history_path());

        loop {
            let prompt = "  ? ";
            let line = match rl.readline(prompt) {
                Ok(line) => line,
                Err(rustyline::error::ReadlineError::Eof)
                | Err(rustyline::error::ReadlineError::Interrupted) => {
                    let _ = self.renderer.write_notice("session closed");
                    break;
                }
                Err(e) => {
                    let _ = self.renderer.write_error(&format!("input error: {e}"));
                    break;
                }
            };
            let _ = rl.add_history_entry(line.as_str());

            // Slash command dispatch.
            match SlashCommand::parse(&line) {
                Ok(Some(SlashCommand::Exit)) => {
                    let _ = self.renderer.write_notice("session closed");
                    break;
                }
                Ok(Some(SlashCommand::Help)) => {
                    let _ = self.renderer.write_token(SlashCommand::HELP_TEXT);
                    continue;
                }
                Ok(Some(SlashCommand::Clear)) => {
                    // Clear screen via ANSI; preserve session state.
                    print!("\x1b[2J\x1b[1;1H");
                    let _ = std::io::stdout().flush();
                    self.print_repl_banner();
                    continue;
                }
                Ok(Some(SlashCommand::History)) => {
                    let history = load_history(&self.session_id).unwrap_or_default();
                    if history.is_empty() {
                        let _ = self.renderer.write_notice("history is empty");
                    } else {
                        self.print_replay(&history);
                    }
                    continue;
                }
                Ok(Some(SlashCommand::Save)) => {
                    let _ = self.renderer.write_notice(&format!(
                        "history persisted at {}",
                        self.history_path.display()
                    ));
                    continue;
                }
                Ok(Some(SlashCommand::Model { id })) => {
                    self.current_model = Some(id.clone());
                    let _ = self
                        .renderer
                        .write_notice(&format!("model switched to {id}"));
                    continue;
                }
                Ok(None) => {
                    // Empty input — silently re-prompt.
                    if line.trim().is_empty() {
                        continue;
                    }
                }
                Err(SlashCommandParseError::UnknownCommand { name }) => {
                    let _ = self
                        .renderer
                        .write_error(&format!("unknown command: /{name} — try /help"));
                    continue;
                }
                Err(e) => {
                    let _ = self.renderer.write_error(&e.to_string());
                    continue;
                }
            }

            // Treat as user turn. Open a fresh connection per turn.
            let mut cfg = self.opts.resolve(Some(&self.session_id))?;
            cfg.from_sequence = self.last_seq;
            if self.current_model.is_some() {
                cfg.model = self.current_model.clone();
            }
            let mut stream = match agent_stream::connect(cfg).await {
                Ok(s) => s,
                Err(e) => {
                    let _ = self.renderer.write_error(&format!("connect failed: {e}"));
                    continue;
                }
            };
            if let Err(e) = self.send_turn(&mut *stream, &line).await {
                let _ = self.renderer.write_error(&format!("send failed: {e}"));
                let _ = stream.close().await;
                continue;
            }
            if let Err(e) = self.drain_until_turn_end(&mut *stream).await {
                let _ = self.renderer.write_error(&format!("stream error: {e}"));
            }
            let _ = stream.close().await;
        }

        let _ = rl.save_history(&rustyline_history_path());
        Ok(())
    }

    fn print_repl_banner(&mut self) {
        let model = self.current_model.as_deref().unwrap_or(DEFAULT_MODEL);
        let _ = self.renderer.write_notice(&format!(
            "broomva chat v{} — model {} — session {}",
            env!("CARGO_PKG_VERSION"),
            model,
            self.session_id
        ));
        let _ = self.renderer.write_notice(
            "type /help for commands, /exit to quit, ESC to interrupt a streaming reply",
        );
    }

    /// Send a single user turn over the open stream and persist it to
    /// history.jsonl.
    pub async fn send_turn(
        &mut self,
        stream: &mut dyn AgentStream,
        text: &str,
    ) -> BroomvaResult<()> {
        let model = self.current_model.clone();
        let frame = OutboundFrame::UserTurn {
            text: text.to_string(),
            from_sequence: self.last_seq,
            model: model.clone(),
        };
        let next_seq = self.last_seq.map(|s| s + 1).unwrap_or(0);
        let entry = HistoryEntry {
            role: HistoryRole::User,
            content: text.to_string(),
            ts: Utc::now(),
            model,
            session_id: self.session_id.clone(),
            seq: next_seq,
        };
        append_history(&self.history_path, &entry)?;
        stream.send(frame).await
    }

    /// Drain streamed events until `TurnComplete` or `Closed`.
    /// Renders tokens via the renderer; appends the final assistant
    /// message to history when the turn ends cleanly.
    pub async fn drain_until_turn_end(
        &mut self,
        stream: &mut dyn AgentStream,
    ) -> BroomvaResult<()> {
        let mut assistant_buf = String::new();
        let mut effective_model: Option<String> = None;
        loop {
            // Cancel via ESC if the user presses it. We poll every
            // event so the interrupt is at most one-token latent.
            if crate::tui::esc_pressed() {
                let _ = stream.send(OutboundFrame::Cancel).await;
                let _ = self.renderer.write_notice("cancelled (ESC)");
                break;
            }

            let evt = stream.recv().await?;
            let Some(evt) = evt else {
                let _ = self.renderer.write_notice("stream closed (no close frame)");
                break;
            };
            match evt {
                StreamEvent::Opened { session_id, model } => {
                    if self.session_id != session_id {
                        // Gateway issued a different session id than
                        // the client requested — adopt it. Spec
                        // doesn't say which side wins; the safe rule
                        // is "server-issued ids are authoritative".
                        self.session_id = session_id;
                    }
                    effective_model = Some(model);
                }
                StreamEvent::Token { text, sequence } => {
                    self.last_seq = Some(sequence);
                    let _ = self.renderer.write_token(&text);
                    assistant_buf.push_str(&text);
                }
                StreamEvent::TurnComplete {
                    latency_ms,
                    cost_usd,
                } => {
                    let _ = self.renderer.write_line();
                    if let (Some(ms), Some(c)) = (latency_ms, cost_usd) {
                        let _ = self
                            .renderer
                            .write_notice(&format!("turn complete — {ms} ms — ${c:.4}"));
                    } else if let Some(ms) = latency_ms {
                        let _ = self
                            .renderer
                            .write_notice(&format!("turn complete — {ms} ms"));
                    } else {
                        let _ = self.renderer.write_notice("turn complete");
                    }
                    // Persist assistant reply.
                    let next_seq = self.last_seq.map(|s| s + 1).unwrap_or(0);
                    let entry = HistoryEntry {
                        role: HistoryRole::Assistant,
                        content: assistant_buf,
                        ts: Utc::now(),
                        model: effective_model.or_else(|| self.current_model.clone()),
                        session_id: self.session_id.clone(),
                        seq: next_seq,
                    };
                    append_history(&self.history_path, &entry)?;
                    break;
                }
                StreamEvent::TurnError { message } => {
                    let _ = self.renderer.write_error(&format!("turn error: {message}"));
                    // Persist the partial assistant message + the system error.
                    if !assistant_buf.is_empty() {
                        let next_seq = self.last_seq.map(|s| s + 1).unwrap_or(0);
                        let entry = HistoryEntry {
                            role: HistoryRole::Assistant,
                            content: std::mem::take(&mut assistant_buf),
                            ts: Utc::now(),
                            model: effective_model
                                .clone()
                                .or_else(|| self.current_model.clone()),
                            session_id: self.session_id.clone(),
                            seq: next_seq,
                        };
                        append_history(&self.history_path, &entry)?;
                    }
                    let next_seq = self.last_seq.map(|s| s + 1).unwrap_or(0);
                    let entry = HistoryEntry {
                        role: HistoryRole::System,
                        content: format!("turn_error: {message}"),
                        ts: Utc::now(),
                        model: effective_model.or_else(|| self.current_model.clone()),
                        session_id: self.session_id.clone(),
                        seq: next_seq,
                    };
                    append_history(&self.history_path, &entry)?;
                    break;
                }
                StreamEvent::Closed { code, reason } => {
                    let _ = self
                        .renderer
                        .write_error(&format!("connection closed: {} ({reason})", code.label()));
                    break;
                }
                StreamEvent::Reconnecting { attempt } => {
                    let _ = self
                        .renderer
                        .write_notice(&format!("reconnecting (attempt {attempt})"));
                }
            }
            // Warn (once) when the history file gets large.
            if let Ok(meta) = fs::metadata(&self.history_path)
                && meta.len() > HISTORY_SIZE_WARN_BYTES
            {
                let _ = self.renderer.write_notice(
                    "history > 10MB — consider `broomva chat sessions prune --older-than 30d`",
                );
            }
        }
        Ok(())
    }
}

// ── On-disk paths + helpers ──────────────────────────────────────────

/// Locate the sessions directory. By default it's
/// `~/.broomva/sessions/`; tests + sandboxed callers can override via
/// `BROOMVA_SESSIONS_DIR` to avoid clobbering the user's real on-disk
/// history.
fn sessions_dir() -> PathBuf {
    if let Ok(dir) = std::env::var("BROOMVA_SESSIONS_DIR")
        && !dir.is_empty()
    {
        return PathBuf::from(dir);
    }
    config_dir().join("sessions")
}

fn session_history_path(session_id: &str) -> PathBuf {
    sessions_dir().join(session_id).join("history.jsonl")
}

fn rustyline_history_path() -> PathBuf {
    sessions_dir().join(".rustyline-history")
}

fn new_session_id() -> String {
    // The spec says ULID OR UUIDv7. uuid is already a dep with v4;
    // v7 is in 1.10+ but unavailable here without enabling a feature
    // flag. Use UUID v4 — sortable enough for our needs (sort by
    // mtime), and human-readable.
    Uuid::new_v4().simple().to_string()
}

fn append_history(path: &Path, entry: &HistoryEntry) -> BroomvaResult<()> {
    let f = OpenOptions::new().create(true).append(true).open(path)?;
    let mut w = BufWriter::new(f);
    let line = serde_json::to_string(entry)?;
    writeln!(w, "{line}")?;
    w.flush()?;
    Ok(())
}

/// Read the history.jsonl for a session. Returns empty when missing.
pub fn load_history(session_id: &str) -> BroomvaResult<Vec<HistoryEntry>> {
    let path = session_history_path(session_id);
    if !path.exists() {
        return Ok(Vec::new());
    }
    let f = File::open(&path)?;
    let r = BufReader::new(f);
    let mut entries = Vec::new();
    for (idx, line) in r.lines().enumerate() {
        let line = line?;
        if line.trim().is_empty() {
            continue;
        }
        match serde_json::from_str::<HistoryEntry>(&line) {
            Ok(entry) => entries.push(entry),
            Err(e) => {
                // Tolerate forward-compat / hand-edited entries: skip
                // and continue rather than crash the resume.
                tracing::warn!(
                    "history line {} in {} unparseable, skipping: {e}",
                    idx + 1,
                    path.display()
                );
            }
        }
    }
    Ok(entries)
}

fn first_user_line(history_path: &Path) -> Option<String> {
    let f = File::open(history_path).ok()?;
    let r = BufReader::new(f);
    for line in r.lines().take(64) {
        let line = line.ok()?;
        let entry: HistoryEntry = serde_json::from_str(&line).ok()?;
        if entry.role == HistoryRole::User {
            let preview = if entry.content.len() > 60 {
                format!("{}…", &entry.content[..60])
            } else {
                entry.content
            };
            return Some(preview);
        }
    }
    None
}

fn build_rustyline_editor() -> rustyline::DefaultEditor {
    // Reasonable defaults — multi-line input disabled (chat turns are
    // single-line); history file path is global so it's shared across
    // sessions.
    rustyline::DefaultEditor::new().expect("failed to build rustyline editor")
}

// ── Tests ────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn new_session_id_is_unique() {
        let a = new_session_id();
        let b = new_session_id();
        assert_ne!(a, b);
        assert!(a.len() >= 16);
    }

    #[test]
    fn history_round_trips_through_jsonl() {
        let tmp = tempdir().unwrap();
        let path = tmp.path().join("history.jsonl");
        let entry = HistoryEntry {
            role: HistoryRole::User,
            content: "hello world".into(),
            ts: Utc::now(),
            model: Some("claude-sonnet-4-6".into()),
            session_id: "s1".into(),
            seq: 0,
        };
        append_history(&path, &entry).unwrap();

        let line = std::fs::read_to_string(&path).unwrap();
        let parsed: HistoryEntry = serde_json::from_str(line.trim()).unwrap();
        assert_eq!(parsed.role, HistoryRole::User);
        assert_eq!(parsed.content, "hello world");
        assert_eq!(parsed.seq, 0);
    }

    #[test]
    fn history_appends_multiple_entries_in_order() {
        let tmp = tempdir().unwrap();
        let path = tmp.path().join("history.jsonl");
        for i in 0..3 {
            let entry = HistoryEntry {
                role: HistoryRole::User,
                content: format!("turn {i}"),
                ts: Utc::now(),
                model: None,
                session_id: "s1".into(),
                seq: i,
            };
            append_history(&path, &entry).unwrap();
        }
        let s = std::fs::read_to_string(&path).unwrap();
        let lines: Vec<_> = s.lines().collect();
        assert_eq!(lines.len(), 3);
        let first: HistoryEntry = serde_json::from_str(lines[0]).unwrap();
        assert_eq!(first.content, "turn 0");
        let last: HistoryEntry = serde_json::from_str(lines[2]).unwrap();
        assert_eq!(last.seq, 2);
    }

    #[test]
    fn known_models_includes_default() {
        assert!(KNOWN_MODELS.contains(&DEFAULT_MODEL));
    }

    #[test]
    fn chat_run_opts_resolve_uses_default_model_when_unset() {
        // Isolate from the user's real env/config.
        // SAFETY: set_var on a single-threaded section of a test; no
        // other thread mutates env in this test.
        unsafe {
            std::env::remove_var("BROOMVA_MODEL");
            std::env::remove_var("BROOMVA_GATEWAY_URL");
            std::env::remove_var("BROOMVA_TOKEN");
            std::env::remove_var("BROOMVA_USER_ID");
            std::env::remove_var("BROOMVA_PROJECT_ID");
        }
        let opts = ChatRunOpts {
            prompt: None,
            session_id: None,
            model: None,
            gateway_url: Some("ws://localhost:1".into()),
            token_override: None,
            ca_cert_path: None,
            user_id_override: None,
            project_id_override: None,
        };
        let cfg = opts.resolve(None).unwrap();
        assert_eq!(cfg.model.as_deref(), Some(DEFAULT_MODEL));
        assert_eq!(cfg.gateway_url, "ws://localhost:1");
        // BRO-1189 — project_id has a sentinel default; user_id falls
        // back through token-derived → "default-user", but the
        // host's `~/.broomva/config.json` may carry a real token
        // whose `sub` becomes the user_id. We only assert the value
        // is non-empty + that the field exists (the
        // `derive_user_id_from_token` tests cover the actual mapping).
        assert!(!cfg.user_id.is_empty(), "user_id resolves to a value");
        assert_eq!(cfg.project_id, "default");
    }

    #[test]
    fn chat_run_opts_resolve_uses_explicit_user_override() {
        unsafe {
            std::env::remove_var("BROOMVA_USER_ID");
            std::env::remove_var("BROOMVA_PROJECT_ID");
            std::env::remove_var("BROOMVA_TOKEN");
        }
        let opts = ChatRunOpts {
            prompt: None,
            session_id: None,
            model: None,
            gateway_url: Some("ws://localhost:1".into()),
            token_override: None,
            ca_cert_path: None,
            user_id_override: Some("explicit-alice".into()),
            project_id_override: Some("explicit-project".into()),
        };
        let cfg = opts.resolve(None).unwrap();
        assert_eq!(cfg.user_id, "explicit-alice");
        assert_eq!(cfg.project_id, "explicit-project");
    }

    #[test]
    fn chat_run_opts_resolve_derives_user_from_dev_token() {
        unsafe {
            std::env::remove_var("BROOMVA_USER_ID");
            std::env::remove_var("BROOMVA_PROJECT_ID");
        }
        let opts = ChatRunOpts {
            prompt: None,
            session_id: None,
            model: None,
            gateway_url: Some("ws://localhost:1".into()),
            token_override: Some("dev-token-for-test-user-1".into()),
            ca_cert_path: None,
            user_id_override: None,
            project_id_override: None,
        };
        let cfg = opts.resolve(None).unwrap();
        assert_eq!(cfg.user_id, "test-user-1");
    }

    #[test]
    fn chat_run_opts_resolve_respects_explicit_model_flag() {
        unsafe {
            std::env::remove_var("BROOMVA_MODEL");
        }
        let opts = ChatRunOpts {
            prompt: None,
            session_id: None,
            model: Some("claude-opus-4-7".into()),
            gateway_url: None,
            token_override: None,
            ca_cert_path: None,
            user_id_override: None,
            project_id_override: None,
        };
        let cfg = opts.resolve(None).unwrap();
        assert_eq!(cfg.model.as_deref(), Some("claude-opus-4-7"));
    }

    #[test]
    fn derive_user_id_from_dev_shortcut_returns_suffix() {
        assert_eq!(
            derive_user_id_from_token("dev-token-for-alice"),
            Some("alice".to_string())
        );
        assert_eq!(
            derive_user_id_from_token("dev-token-for-test-user-1"),
            Some("test-user-1".to_string())
        );
    }

    #[test]
    fn derive_user_id_from_empty_dev_shortcut_returns_none() {
        assert!(derive_user_id_from_token("dev-token-for-").is_none());
    }

    #[test]
    fn derive_user_id_from_garbage_token_returns_none() {
        assert!(derive_user_id_from_token("not-a-token").is_none());
        assert!(derive_user_id_from_token("").is_none());
    }

    #[test]
    fn derive_user_id_from_real_jws_extracts_sub() {
        // Build a fake JWS with `sub: "carlos"` in the body. Header +
        // signature are placeholders — we only decode the body.
        let header = "eyJhbGciOiJFUzI1NiJ9"; // {"alg":"ES256"}
        // {"sub":"carlos"} base64url no-pad:
        let body = base64_url_encode(br#"{"sub":"carlos"}"#);
        let sig = "AAA";
        let token = format!("{header}.{body}.{sig}");
        assert_eq!(derive_user_id_from_token(&token), Some("carlos".into()));
    }

    fn base64_url_encode(bytes: &[u8]) -> String {
        // Tiny base64url no-pad encoder for the test.
        const ALPHA: &[u8; 64] =
            b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
        let mut out = String::new();
        let mut buf: u32 = 0;
        let mut bits: u32 = 0;
        for b in bytes {
            buf = (buf << 8) | u32::from(*b);
            bits += 8;
            while bits >= 6 {
                bits -= 6;
                out.push(ALPHA[((buf >> bits) & 0x3F) as usize] as char);
            }
        }
        if bits > 0 {
            out.push(ALPHA[((buf << (6 - bits)) & 0x3F) as usize] as char);
        }
        out
    }
}
