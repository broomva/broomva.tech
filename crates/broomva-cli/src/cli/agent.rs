//! `broomva agent` — Phase B typed task invocation.
//!
//! Implements the **Agent Invocation Contract** (AC-1..AC-6) from
//! `docs/specs/2026-05-18-broomva-cli-agent-chat-pipeline.md` §3.2.
//!
//! Six subcommands:
//!
//! - `run <task.yaml>` — load + validate + submit + (default sync) watch
//! - `list [--status]` — newest-first listing
//! - `get <run-id>` — single-run detail
//! - `tail <run-id>` — follow event stream live
//! - `cancel <run-id>` — request termination
//! - `templates [list|show|init]` — bundled task templates
//!
//! The CLI composes (rather than re-implements) Phase A's transport
//! and TUI surfaces: `tail` reuses Phase A's renderer trait so event
//! rendering stays consistent across `broomva chat` and `broomva agent`.

use std::fs;
use std::path::{Path, PathBuf};

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::api::lifed::{
    AgentTaskSpec, LifedClient, LifedHttpClient, RunDetail, RunEvent, RunId, RunStatus, RunSummary,
};
use crate::api::output_validator::{OutputVerdict, validate_output};
use crate::cli::output::OutputFormat;
use crate::config::constants::config_dir;
use crate::config::read_config;
use crate::error::{BroomvaError, BroomvaResult};
use crate::tui::{Renderer, StdoutRenderer};

/// Schema literal compiled into the binary. Loading from disk would be
/// brittle (cwd-dependent); embedding via `include_str!` keeps the
/// validator deterministic across install paths.
const TASK_SCHEMA: &str = include_str!("../../schemas/agent-task.v1.json");

/// Bundled task templates. We embed them so `agent templates init`
/// works on a stock install without needing to fetch from the network
/// or rely on the source checkout being present.
const TEMPLATE_FILES: &[(&str, &str)] = &[
    (
        "hello.task.yaml",
        include_str!("../../templates/hello.task.yaml"),
    ),
    (
        "summarize-pr.task.yaml",
        include_str!("../../templates/summarize-pr.task.yaml"),
    ),
    (
        "update-linear.task.yaml",
        include_str!("../../templates/update-linear.task.yaml"),
    ),
    (
        "daily-briefing.task.yaml",
        include_str!("../../templates/daily-briefing.task.yaml"),
    ),
];

/// Default lifed base URL when no override is set. Mirrors the Phase A
/// gateway-url default (production substrate).
pub const DEFAULT_LIFED_BASE_URL: &str = "https://lifed.broomva.tech";

/// Rough cost estimate (USD) per output prompt token. The real model
/// pricing endpoint isn't wired yet (Phase B.1); this stub uses a
/// blended rate that errs on the side of over-estimating so the
/// client-side cost ceiling guard is conservative.
///
/// Calibration: ~$1.5 per million tokens for input + ~$15 per million
/// for output, averaged at 80% input / 20% output weights ⇒ ~$4.2/M
/// blended. Document the stub honestly in CHANGELOG so users know it's
/// a placeholder.
const ESTIMATE_USD_PER_TOKEN: f64 = 4.2e-6;

// ── Public dispatch (called from cli/mod.rs) ─────────────────────────

/// Options passed in from `cli::run_command`. Mirrors `ChatRunOpts` in
/// shape so the two surfaces feel consistent.
///
/// `broomva_client` is intentionally not `Clone`/`Debug`: it owns a
/// `reqwest::Client` which is heap-shared internally and the wider CLI
/// holds exactly one of them per command invocation.
pub struct AgentRunOpts {
    /// `--lifed-url` override.
    pub lifed_url: Option<String>,
    /// Resolved bearer token (from cli::run_command).
    pub token: Option<String>,
    /// Output format for `list` / `get` (table or json).
    pub format: OutputFormat,
    /// Per-turn / per-step timeout override. None ⇒ defer to spec.
    pub turn_timeout_seconds: Option<u64>,
    /// Extra root CA cert path (BRO-1186). Used by `build_lifed_client`
    /// to construct an HTTP client that trusts a dev/self-signed lifed
    /// stack on top of webpki defaults. None ⇒ production CAs only.
    pub ca_cert_path: Option<String>,
    /// API client for telemetry beacons (`/api/invocations` posts).
    pub broomva_client: crate::api::BroomvaClient,
}

#[allow(clippy::too_many_arguments)]
pub async fn handle_run(
    opts: AgentRunOpts,
    task_path: PathBuf,
    inline_spec: Option<String>,
    watch: bool,
    detach: bool,
    dry_run: bool,
    max_cost_usd_override: Option<f64>,
    skip_output_validation: bool,
) -> BroomvaResult<()> {
    let mut renderer: Box<dyn Renderer> = Box::new(StdoutRenderer::default());

    // Resolve spec: either inline JSON or YAML file.
    let raw = if let Some(s) = inline_spec {
        s
    } else {
        fs::read_to_string(&task_path).map_err(|e| {
            BroomvaError::User(format!(
                "failed to read task spec {}: {e}",
                task_path.display()
            ))
        })?
    };
    let parsed: serde_yaml::Value = serde_yaml::from_str(&raw)
        .map_err(|e| BroomvaError::User(format!("task spec is not valid YAML: {e}")))?;
    // Re-serialize through serde_json so the schema validator + lifed
    // wire shape both operate on a serde_json::Value. YAML doesn't
    // have a 1:1 with JSON for some edge cases (binary, !tag) but for
    // our subset this is lossless.
    let as_json: serde_json::Value = serde_json::to_value(parsed)
        .map_err(|e| BroomvaError::User(format!("task spec YAML cannot project to JSON: {e}")))?;

    // AC-1: client-side validation against schemas/agent-task.v1.json.
    validate_task_spec(&as_json)?;

    // Apply --max-cost override + cost-ceiling guard.
    let mut spec: AgentTaskSpec = serde_json::from_value(as_json.clone()).map_err(|e| {
        BroomvaError::User(format!(
            "task spec passes schema but cannot project to AgentTaskSpec: {e}"
        ))
    })?;
    if let Some(cap) = max_cost_usd_override {
        let agent = spec.agent.get_or_insert_with(Default::default);
        agent.max_cost_usd = Some(cap);
    }
    if let Some(t) = opts.turn_timeout_seconds {
        let agent = spec.agent.get_or_insert_with(Default::default);
        agent.timeout_seconds = Some(t);
    }
    let estimate = estimate_cost_usd(&spec);
    if let Some(cap) = spec.agent.as_ref().and_then(|a| a.max_cost_usd)
        && estimate > cap
    {
        return Err(BroomvaError::User(format!(
            "estimated cost ${estimate:.4} exceeds max_cost_usd ${cap:.4} — raise the cap, shorten the prompt, or set --max-cost to override"
        )));
    }

    if dry_run {
        let _ = renderer.write_notice(&format!(
            "dry-run: task `{}` validated; estimated cost ${estimate:.4}",
            spec.name
        ));
        if let Some(cap) = spec.agent.as_ref().and_then(|a| a.max_cost_usd) {
            let _ = renderer.write_notice(&format!("dry-run: max_cost_usd cap ${cap:.4}"));
        }
        return Ok(());
    }

    // Fire telemetry beacon BEFORE submitting to lifed. Mirrors the
    // `prompts pull` shape: returns an invocation id we can update on
    // completion. Failure to beacon is logged but never blocks.
    let beacon = beacon_agent_run(&opts.broomva_client, &spec.name).await;

    // Submit to lifed. On failure, best-effort mark the telemetry
    // beacon as failed before propagating so we don't leak a dangling
    // invocation row in the telemetry plane.
    let client = build_lifed_client(&opts)?;
    let resp = match client.create_session(&spec).await {
        Ok(r) => r,
        Err(e) => {
            mark_beacon(
                &opts.broomva_client,
                &beacon.id,
                "failed",
                Some(format!("create_session: {e}")),
            )
            .await;
            return Err(e);
        }
    };
    let run_id = resp.run_id.clone();

    let _ = renderer.write_notice(&format!(
        "submitted task `{}` → run_id {} (status: {})",
        spec.name,
        run_id,
        resp.status.label()
    ));
    if let Some(sid) = &resp.session_id {
        let _ = renderer.write_notice(&format!("session_id {sid}"));
    }

    // Local filesystem prep — runs/<run_id>/metadata.yaml.
    let run_dir = run_directory(&run_id);
    fs::create_dir_all(&run_dir).map_err(|e| {
        BroomvaError::User(format!(
            "failed to create run dir {}: {e}",
            run_dir.display()
        ))
    })?;
    let now = Utc::now();
    let mut metadata = RunMetadata {
        run_id: run_id.clone(),
        task_name: spec.name.clone(),
        created_at: now,
        completed_at: None,
        status: resp.status,
        cost_estimate_usd: estimate,
        cost_actual_usd: None,
        output_validation_verdict: None,
        beacon_invocation_id: Some(beacon.id.clone()),
    };
    write_metadata(&run_dir, &metadata)?;

    if detach {
        let _ = renderer.write_notice(
            "--detach: returning immediately; use `agent tail` or `agent get` to follow.",
        );
        return Ok(());
    }

    if !watch && !detach {
        // The spec's open question §10.2 leans `sync` as default; we
        // default to watching the stream until terminal.
    }

    // Tail until terminal.
    let mut stream = client.stream_session(&run_id, None).await?;
    let mut last_output: Option<serde_json::Value> = None;
    let mut last_cost: Option<f64> = None;
    while let Some(evt) = stream.next().await? {
        render_event(&mut *renderer, &evt);
        match &evt {
            RunEvent::Done {
                status,
                output,
                cost_usd,
            } => {
                metadata.status = *status;
                metadata.completed_at = Some(Utc::now());
                last_output = output.clone();
                last_cost = *cost_usd;
                break;
            }
            RunEvent::StatusChanged { status, .. } => {
                metadata.status = *status;
            }
            RunEvent::Cost { usd, .. } => {
                let prev = last_cost.unwrap_or(0.0);
                last_cost = Some(prev + usd);
            }
            _ => {}
        }
    }

    metadata.cost_actual_usd = last_cost;

    // Persist output.json if produced; run output-schema validation.
    if let Some(output) = &last_output {
        let output_path = output_save_path(
            &run_dir,
            spec.output.as_ref().and_then(|o| o.save_to.as_deref()),
            &run_id,
        );
        if let Some(parent) = output_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| BroomvaError::User(format!("output dir: {e}")))?;
        }
        fs::write(
            &output_path,
            serde_json::to_string_pretty(output).map_err(BroomvaError::Json)?,
        )?;

        // AC-5: validate output against spec's output.schema.
        let verdict = if skip_output_validation {
            OutputVerdict::Skipped
        } else {
            let schema = spec.output.as_ref().and_then(|o| o.schema.as_ref());
            match validate_output(schema, output) {
                Ok(v) => v,
                Err(fault) => {
                    let _ = renderer.write_error(&format!("output schema invalid: {fault}"));
                    OutputVerdict::Skipped
                }
            }
        };
        if let OutputVerdict::Fail { errors } = &verdict {
            let _ = renderer.write_error(&format!(
                "output validation failed ({} error(s))",
                errors.len()
            ));
            for err in errors.iter().take(5) {
                let _ = renderer.write_error(&format!("  • {err}"));
            }
            if errors.len() > 5 {
                let _ = renderer.write_notice(&format!(
                    "  … {} more error(s) in metadata.yaml",
                    errors.len() - 5
                ));
            }
        }
        metadata.output_validation_verdict = Some(verdict.tag().to_string());
    }

    write_metadata(&run_dir, &metadata)?;
    let _ = renderer.write_notice(&format!(
        "done — status {} — transcript + output at {}",
        metadata.status.label(),
        run_dir.display()
    ));

    // Close out the telemetry beacon.
    mark_beacon(
        &opts.broomva_client,
        &beacon.id,
        if metadata.status == RunStatus::Completed {
            "completed"
        } else {
            "failed"
        },
        None,
    )
    .await;

    Ok(())
}

pub async fn handle_list(
    opts: AgentRunOpts,
    status: Option<RunStatus>,
    limit: Option<u32>,
) -> BroomvaResult<()> {
    let client = build_lifed_client(&opts)?;
    let rows = client.list_sessions(status, limit).await?;
    // P19 telemetry beacon — fire-and-forget for read-only operations.
    let _ = beacon_agent_op(&opts.broomva_client, "list").await;
    render_list(&rows, opts.format)
}

pub async fn handle_get(opts: AgentRunOpts, run_id: RunId) -> BroomvaResult<()> {
    let client = build_lifed_client(&opts)?;
    let detail = client.get_session(&run_id).await?;
    let _ = beacon_agent_op(&opts.broomva_client, "get").await;
    render_get(&detail, opts.format)
}

pub async fn handle_tail(
    opts: AgentRunOpts,
    run_id: RunId,
    from_sequence: Option<u64>,
) -> BroomvaResult<()> {
    let client = build_lifed_client(&opts)?;
    let mut stream = client.stream_session(&run_id, from_sequence).await?;
    let mut renderer: Box<dyn Renderer> = Box::new(StdoutRenderer::default());
    let _ = beacon_agent_op(&opts.broomva_client, "tail").await;
    let _ = renderer.write_notice(&format!("tailing run {run_id} (Ctrl-C to detach)"));
    while let Some(evt) = stream.next().await? {
        render_event(&mut *renderer, &evt);
        if let RunEvent::Done { .. } = evt {
            break;
        }
    }
    Ok(())
}

pub async fn handle_cancel(opts: AgentRunOpts, run_id: RunId) -> BroomvaResult<()> {
    let client = build_lifed_client(&opts)?;
    let new_status = client.cancel_session(&run_id).await?;
    let _ = beacon_agent_op(&opts.broomva_client, "cancel").await;
    println!("  run {run_id} → {}", new_status.label());
    Ok(())
}

pub fn handle_templates_list() -> BroomvaResult<()> {
    println!("  Bundled task templates ({}):", TEMPLATE_FILES.len());
    for (name, _) in TEMPLATE_FILES {
        println!("    {name}");
    }
    let user_dir = templates_user_dir();
    if user_dir.exists() {
        let user_templates: Vec<_> = fs::read_dir(&user_dir)
            .map(|rd| {
                rd.filter_map(|e| e.ok())
                    .filter(|e| {
                        e.path()
                            .extension()
                            .and_then(|s| s.to_str())
                            .map(|s| {
                                s.eq_ignore_ascii_case("yaml") || s.eq_ignore_ascii_case("yml")
                            })
                            .unwrap_or(false)
                    })
                    .map(|e| e.file_name().to_string_lossy().to_string())
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        if !user_templates.is_empty() {
            println!("  User templates ({}):", user_templates.len());
            for name in user_templates {
                println!("    {name}");
            }
        }
    }
    println!(
        "  Run `broomva agent templates init` to copy bundled templates into {}",
        user_dir.display()
    );
    Ok(())
}

pub fn handle_templates_show(name: String) -> BroomvaResult<()> {
    // Try bundled first.
    for (entry_name, body) in TEMPLATE_FILES {
        if *entry_name == name
            || normalize_template_name(entry_name) == normalize_template_name(&name)
        {
            print!("{body}");
            return Ok(());
        }
    }
    // Try user dir.
    let user_path = templates_user_dir().join(&name);
    if user_path.exists() {
        let body = fs::read_to_string(&user_path)?;
        print!("{body}");
        return Ok(());
    }
    Err(BroomvaError::User(format!(
        "no template `{name}` — try `broomva agent templates list`"
    )))
}

pub fn handle_templates_init(force: bool) -> BroomvaResult<()> {
    let dir = templates_user_dir();
    fs::create_dir_all(&dir)?;
    let mut copied = 0usize;
    let mut skipped = 0usize;
    for (name, body) in TEMPLATE_FILES {
        let dst = dir.join(name);
        if dst.exists() && !force {
            skipped += 1;
            continue;
        }
        fs::write(&dst, body)?;
        copied += 1;
    }
    println!("  templates init → {}", dir.display());
    println!("    copied: {copied}");
    if skipped > 0 {
        println!("    skipped (already present): {skipped} — pass --force to overwrite");
    }
    Ok(())
}

// ── Internals ────────────────────────────────────────────────────────

/// Validate the parsed task spec against the embedded JSON schema.
/// Returns `BroomvaError::User` listing every violation.
pub fn validate_task_spec(spec_json: &serde_json::Value) -> BroomvaResult<()> {
    let schema: serde_json::Value = serde_json::from_str(TASK_SCHEMA).map_err(|e| {
        BroomvaError::User(format!(
            "internal: task schema embedded at compile time is malformed: {e}"
        ))
    })?;
    let validator = jsonschema::draft202012::new(&schema)
        .map_err(|e| BroomvaError::User(format!("internal: task schema didn't compile: {e}")))?;
    let errors: Vec<String> = validator
        .iter_errors(spec_json)
        .map(|e| {
            let path = e.instance_path().to_string();
            if path.is_empty() {
                format!("<root>: {e}")
            } else {
                format!("{path}: {e}")
            }
        })
        .collect();
    if !errors.is_empty() {
        let preview = errors
            .iter()
            .take(8)
            .map(|s| format!("  • {s}"))
            .collect::<Vec<_>>()
            .join("\n");
        let trailing = if errors.len() > 8 {
            format!("\n  • … {} more error(s)", errors.len() - 8)
        } else {
            String::new()
        };
        return Err(BroomvaError::User(format!(
            "task spec validation failed ({} error(s)):\n{preview}{trailing}",
            errors.len()
        )));
    }
    Ok(())
}

/// Stub cost estimator. Token count = prompt char count / 4 (rough
/// rule of thumb). Phase B.1 will wire to a real lifed model-pricing
/// endpoint.
fn estimate_cost_usd(spec: &AgentTaskSpec) -> f64 {
    let prompt_len = spec.input.prompt.len();
    let estimated_tokens = (prompt_len as f64 / 4.0).ceil();
    (estimated_tokens * ESTIMATE_USD_PER_TOKEN).max(0.0)
}

fn build_lifed_client(opts: &AgentRunOpts) -> BroomvaResult<Box<dyn LifedClient>> {
    let url = opts
        .lifed_url
        .clone()
        .or_else(|| {
            std::env::var("BROOMVA_LIFED_URL")
                .ok()
                .filter(|s| !s.is_empty())
        })
        .or_else(|| {
            read_config().ok().and_then(|c| {
                let v = serde_json::to_value(c).ok()?;
                v.get("lifedBaseUrl")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string())
            })
        })
        .unwrap_or_else(|| DEFAULT_LIFED_BASE_URL.to_string());
    // BRO-1186: --cacert / BROOMVA_CA_CERT flows in via opts.ca_cert_path.
    let ca = crate::api::tls::resolve_ca_cert_path(opts.ca_cert_path.as_deref());
    let client = LifedHttpClient::with_dev_cert(url, opts.token.clone(), ca.as_deref())?;
    Ok(Box::new(client))
}

fn run_directory(run_id: &str) -> PathBuf {
    runs_dir().join(run_id)
}

fn runs_dir() -> PathBuf {
    if let Ok(p) = std::env::var("BROOMVA_RUNS_DIR")
        && !p.is_empty()
    {
        return PathBuf::from(p);
    }
    config_dir().join("runs")
}

fn templates_user_dir() -> PathBuf {
    if let Ok(p) = std::env::var("BROOMVA_TEMPLATES_DIR")
        && !p.is_empty()
    {
        return PathBuf::from(p);
    }
    config_dir().join("templates")
}

fn normalize_template_name(s: &str) -> String {
    s.to_ascii_lowercase()
        .trim_end_matches(".yaml")
        .trim_end_matches(".yml")
        .trim_end_matches(".task")
        .to_string()
}

fn output_save_path(run_dir: &Path, save_to: Option<&str>, run_id: &str) -> PathBuf {
    if let Some(s) = save_to {
        let expanded = s.replace("{run_id}", run_id);
        let expanded = if expanded.starts_with("~/") {
            dirs::home_dir()
                .map(|h| h.join(expanded.trim_start_matches("~/")))
                .unwrap_or_else(|| PathBuf::from(expanded.trim_start_matches("~/")))
        } else {
            PathBuf::from(expanded)
        };
        return expanded;
    }
    run_dir.join("output.json")
}

// ── Run-metadata on-disk format ──────────────────────────────────────

/// Shape persisted at `~/.broomva/runs/<run_id>/metadata.yaml`. Stable
/// for Phase B; new fields use `#[serde(default)]` so older files
/// remain parseable.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunMetadata {
    pub run_id: String,
    pub task_name: String,
    pub created_at: DateTime<Utc>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub completed_at: Option<DateTime<Utc>>,
    pub status: RunStatus,
    pub cost_estimate_usd: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cost_actual_usd: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub output_validation_verdict: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub beacon_invocation_id: Option<String>,
}

fn write_metadata(run_dir: &Path, metadata: &RunMetadata) -> BroomvaResult<()> {
    let path = run_dir.join("metadata.yaml");
    let yaml = serde_yaml::to_string(metadata)
        .map_err(|e| BroomvaError::User(format!("metadata serialize: {e}")))?;
    fs::write(&path, yaml)?;
    Ok(())
}

// ── Renderers ────────────────────────────────────────────────────────

fn render_event(renderer: &mut dyn Renderer, evt: &RunEvent) {
    match evt {
        RunEvent::StatusChanged { status, message } => {
            let msg = message
                .as_deref()
                .map(|m| format!(": {m}"))
                .unwrap_or_default();
            let _ = renderer.write_notice(&format!("status → {}{msg}", status.label()));
        }
        RunEvent::ToolCall { name, args } => {
            let preview = args
                .as_ref()
                .and_then(|v| serde_json::to_string(v).ok())
                .map(|s| {
                    if s.len() > 120 {
                        format!("{}…", &s[..120])
                    } else {
                        s
                    }
                })
                .unwrap_or_default();
            let _ = renderer.write_notice(&format!("tool_call: {name} {preview}"));
        }
        RunEvent::ToolResult { name, .. } => {
            let _ = renderer.write_notice(&format!("tool_result: {name}"));
        }
        RunEvent::Reasoning { text } => {
            let _ = renderer.write_token(text);
        }
        RunEvent::Output { text } => {
            let _ = renderer.write_token(text);
        }
        RunEvent::Cost { usd, component } => {
            let comp = component
                .as_deref()
                .map(|c| format!(" ({c})"))
                .unwrap_or_default();
            let _ = renderer.write_notice(&format!("cost: ${usd:.4}{comp}"));
        }
        RunEvent::Done {
            status, cost_usd, ..
        } => {
            let cost = cost_usd.map(|c| format!(" — ${c:.4}")).unwrap_or_default();
            let _ = renderer.write_notice(&format!("done — {}{cost}", status.label()));
        }
    }
}

fn render_list(rows: &[RunSummary], format: OutputFormat) -> BroomvaResult<()> {
    match format {
        OutputFormat::Json => {
            println!("{}", serde_json::to_string_pretty(rows)?);
        }
        OutputFormat::Table => {
            if rows.is_empty() {
                println!("  no runs yet — submit one with `broomva agent run <task.yaml>`");
                return Ok(());
            }
            println!(
                "  {:<28} {:<24} {:<10} {:<20} {:>8}",
                "run_id", "name", "status", "created_at", "cost"
            );
            for r in rows {
                let cost = r
                    .cost_usd
                    .map(|c| format!("${c:.4}"))
                    .unwrap_or_else(|| "—".into());
                println!(
                    "  {:<28} {:<24} {:<10} {:<20} {:>8}",
                    truncate(&r.run_id, 28),
                    truncate(&r.name, 24),
                    r.status.label(),
                    truncate(&r.created_at, 20),
                    cost
                );
            }
        }
    }
    Ok(())
}

fn render_get(detail: &RunDetail, format: OutputFormat) -> BroomvaResult<()> {
    match format {
        OutputFormat::Json => {
            println!("{}", serde_json::to_string_pretty(detail)?);
        }
        OutputFormat::Table => {
            println!("  run_id      {}", detail.run_id);
            println!("  name        {}", detail.name);
            println!("  status      {}", detail.status.label());
            println!("  created_at  {}", detail.created_at);
            if let Some(t) = &detail.completed_at {
                println!("  completed   {t}");
            }
            if let Some(c) = detail.cost_usd {
                println!("  cost_usd    ${c:.4}");
            }
            if let Some(err) = &detail.error {
                println!("  error       {err}");
            }
            if let Some(out) = &detail.output {
                println!(
                    "  output      {}",
                    serde_json::to_string_pretty(out).unwrap_or_else(|_| "<unprintable>".into())
                );
            }
        }
    }
    Ok(())
}

fn truncate(s: &str, max: usize) -> String {
    if s.len() <= max {
        s.to_string()
    } else {
        format!("{}…", &s[..max.saturating_sub(1)])
    }
}

// ── Telemetry helpers ────────────────────────────────────────────────

/// Beacon helper for `agent run` — POSTs to /api/invocations with
/// `prompt_slug = agent:<task-name>` so the telemetry plane can group
/// agent runs alongside prompt invocations without schema churn.
async fn beacon_agent_run(
    client: &crate::api::BroomvaClient,
    task_name: &str,
) -> crate::telemetry::beacon::BeaconResult {
    crate::telemetry::beacon::post_invocation_beacon(client, &format!("agent:{task_name}"), "v1")
        .await
}

/// Beacon helper for read-only ops (list / get / tail / cancel).
async fn beacon_agent_op(
    client: &crate::api::BroomvaClient,
    op: &str,
) -> crate::telemetry::beacon::BeaconResult {
    crate::telemetry::beacon::post_invocation_beacon(client, &format!("agent:{op}"), "v1").await
}

async fn mark_beacon(
    client: &crate::api::BroomvaClient,
    invocation_id: &str,
    status: &str,
    error_message: Option<String>,
) {
    let req = crate::api::types::InvocationUpdateRequest {
        status: status.to_string(),
        model: None,
        latency_ms: None,
        tokens_in: None,
        tokens_out: None,
        error_message,
    };
    if let Err(e) = client.update_invocation(invocation_id, &req).await {
        // Telemetry is always best-effort.
        eprintln!("[broomva] telemetry close failed: {e}");
    }
}

// ── Tests ────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn schema_embeds_and_compiles() {
        // The literal we embed at compile-time must parse + compile.
        let v: serde_json::Value = serde_json::from_str(TASK_SCHEMA).unwrap();
        jsonschema::draft202012::new(&v).expect("agent-task.v1.json should compile");
    }

    #[test]
    fn templates_embed_and_validate_against_schema() {
        // Every bundled template must round-trip YAML → JSON and
        // validate against agent-task.v1.json.
        let schema: serde_json::Value = serde_json::from_str(TASK_SCHEMA).unwrap();
        let validator = jsonschema::draft202012::new(&schema).unwrap();
        for (name, body) in TEMPLATE_FILES {
            let parsed: serde_yaml::Value =
                serde_yaml::from_str(body).unwrap_or_else(|e| panic!("template {name} YAML: {e}"));
            let as_json: serde_json::Value = serde_json::to_value(parsed)
                .unwrap_or_else(|e| panic!("template {name} json projection: {e}"));
            let errors: Vec<String> = validator
                .iter_errors(&as_json)
                .map(|e| format!("{e}"))
                .collect();
            assert!(
                errors.is_empty(),
                "template {name} fails schema: {errors:?}"
            );
        }
    }

    #[test]
    fn estimate_cost_returns_nonnegative_for_reasonable_prompt() {
        let spec = AgentTaskSpec {
            name: "x".into(),
            description: None,
            input: super::super::super::api::lifed::AgentInput {
                prompt: "hello".repeat(20),
                variables: None,
            },
            agent: None,
            output: None,
        };
        let c = estimate_cost_usd(&spec);
        assert!(c >= 0.0);
        assert!(c < 1.0, "estimate should be sub-dollar for a tiny prompt");
    }

    #[test]
    fn normalize_template_name_strips_yaml_and_task_suffixes() {
        assert_eq!(normalize_template_name("hello.task.yaml"), "hello");
        assert_eq!(normalize_template_name("hello.YAML"), "hello");
        assert_eq!(normalize_template_name("Hello.task.yml"), "hello");
    }

    #[test]
    fn output_save_path_default_inside_run_dir() {
        let dir = PathBuf::from("/tmp/runs/01X");
        let p = output_save_path(&dir, None, "01X");
        assert_eq!(p, dir.join("output.json"));
    }

    #[test]
    fn output_save_path_interpolates_run_id() {
        let dir = PathBuf::from("/tmp/runs/01X");
        let p = output_save_path(&dir, Some("/tmp/out/{run_id}.json"), "01X");
        assert_eq!(p, PathBuf::from("/tmp/out/01X.json"));
    }

    #[test]
    fn validate_task_spec_accepts_minimal_hello() {
        let v = json!({"name":"hello","input":{"prompt":"hi"}});
        assert!(validate_task_spec(&v).is_ok());
    }

    #[test]
    fn validate_task_spec_rejects_missing_prompt() {
        let v = json!({"name":"x","input":{}});
        let err = validate_task_spec(&v).unwrap_err();
        assert!(err.to_string().contains("prompt"), "{err}");
    }

    #[test]
    fn validate_task_spec_rejects_unknown_top_level_key() {
        let v = json!({"name":"x","input":{"prompt":"p"},"unexpected":1});
        let err = validate_task_spec(&v).unwrap_err();
        let s = err.to_string();
        assert!(s.contains("unexpected") || s.contains("additional"), "{s}");
    }

    #[test]
    fn run_metadata_round_trips_yaml() {
        let m = RunMetadata {
            run_id: "01X".into(),
            task_name: "n".into(),
            created_at: Utc::now(),
            completed_at: None,
            status: RunStatus::Queued,
            cost_estimate_usd: 0.001,
            cost_actual_usd: None,
            output_validation_verdict: None,
            beacon_invocation_id: None,
        };
        let yaml = serde_yaml::to_string(&m).unwrap();
        let back: RunMetadata = serde_yaml::from_str(&yaml).unwrap();
        assert_eq!(back.run_id, "01X");
        assert_eq!(back.status, RunStatus::Queued);
    }
}
