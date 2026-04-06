//! Relay subcommand handlers — remote agent session management.
//!
//! `broomva relay auth`     — registers this machine via device auth
//! `broomva relay start`    — starts life-relayd daemon (exec or inline HTTP polling)
//! `broomva relay stop`     — stops the running daemon
//! `broomva relay status`   — shows nodes, sessions, daemon health
//! `broomva relay sessions` — lists active sessions
//!
//! Auth: reuses the token from `broomva auth login`. The relay daemon
//! reads `~/.broomva/config.json` automatically via life-relayd's
//! token resolution chain.

use std::process::Command as ProcessCommand;

use crate::api::BroomvaClient;
use crate::cli::output::OutputFormat;
use crate::config;
use crate::error::BroomvaResult;

/// Locate the life-relayd binary on PATH or at known locations.
fn find_relayd_binary() -> Option<String> {
    // 1. Check PATH (relayd or life-relayd)
    for name in &["relayd", "life-relayd"] {
        if let Ok(output) = ProcessCommand::new("which").arg(name).output() {
            if output.status.success() {
                let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !path.is_empty() {
                    return Some(path);
                }
            }
        }
    }

    // 2. Check common install locations
    let home = dirs::home_dir().unwrap_or_default();
    let candidates = [
        home.join(".local/bin/relayd"),
        home.join(".local/bin/life-relayd"),
        home.join(".cargo/bin/life-relayd"),
        home.join("broomva/core/life/.target/release/life-relayd"),
    ];

    for path in &candidates {
        if path.exists() {
            return Some(path.to_string_lossy().into_owned());
        }
    }

    None
}

/// Register this machine as a relay node via device auth.
pub async fn handle_auth(client: &BroomvaClient, name: Option<String>) -> BroomvaResult<()> {
    let hostname = hostname::get()
        .map(|h| h.to_string_lossy().into_owned())
        .unwrap_or_else(|_| "unknown".to_string());

    let node_name = name.unwrap_or_else(|| hostname.clone());

    eprintln!("Registering relay node: {node_name}");
    eprintln!("Hostname: {hostname}");
    eprintln!();

    // Use the existing device login flow with relay agent metadata
    let token_response = crate::api::auth::device_login_as_agent(
        client.raw_client(),
        client.base_url(),
        &node_name,
        &hostname,
        &[
            "chat:send",
            "chat:read",
            "deployment:read",
            "deployment:write",
            "memory:read",
            "memory:write",
        ],
    )
    .await?;

    // Store the token
    let computed_expires = token_response.expires_in.map(|secs| {
        let dt = chrono::Utc::now() + chrono::Duration::seconds(secs as i64);
        dt.to_rfc3339()
    });
    let expires_at = token_response
        .expires_at
        .as_deref()
        .or(computed_expires.as_deref());

    config::store_token(&token_response.access_token, expires_at)?;

    eprintln!();
    eprintln!("Relay node registered successfully.");
    eprintln!("Token stored. Run `broomva relay start` to connect.");

    Ok(())
}

/// Start the relay daemon.
///
/// If `life-relayd` binary is found, execs it directly (full PTY + agent support).
/// Otherwise falls back to a lightweight HTTP polling loop.
pub async fn handle_start(_client: &BroomvaClient, bind: &str) -> BroomvaResult<()> {
    // Verify we have a token
    let token = config::resolve_token(None)?;
    if token.is_none() {
        eprintln!("Not authenticated. Run `broomva auth login` first.");
        return Ok(());
    }

    let api_base = config::resolve_api_base(None)?;

    // Try to find and exec the native relay daemon
    if let Some(binary) = find_relayd_binary() {
        eprintln!("Starting relay daemon ({binary})...");
        eprintln!("  Server: {api_base}");
        eprintln!("  Bind:   {bind}");
        eprintln!();

        let status = ProcessCommand::new(&binary)
            .arg("start")
            .arg("--bind")
            .arg(bind)
            .arg("--server")
            .arg(&api_base)
            .env("BROOMVA_TOKEN", token.as_deref().unwrap_or(""))
            .status()
            .map_err(|e| {
                crate::error::BroomvaError::Config(format!("failed to exec {binary}: {e}"))
            })?;

        if !status.success() {
            eprintln!(
                "Relay daemon exited with code {}",
                status.code().unwrap_or(-1)
            );
        }
    } else {
        eprintln!("life-relayd binary not found.");
        eprintln!();
        eprintln!("Installing life-relayd (agent relay daemon)...");

        let install_status = ProcessCommand::new("cargo")
            .arg("install")
            .arg("--git")
            .arg("https://github.com/broomva/life.git")
            .arg("life-relayd")
            .status();

        match install_status {
            Ok(s) if s.success() => {
                eprintln!();
                // Retry with the freshly installed binary
                if let Some(binary) = find_relayd_binary() {
                    eprintln!("Installed. Starting relay daemon ({binary})...");
                    let status = ProcessCommand::new(&binary)
                        .arg("start")
                        .arg("--bind")
                        .arg(bind)
                        .arg("--server")
                        .arg(&api_base)
                        .env("BROOMVA_TOKEN", token.as_deref().unwrap_or(""))
                        .status()
                        .map_err(|e| {
                            crate::error::BroomvaError::Config(format!(
                                "failed to exec {binary}: {e}"
                            ))
                        })?;
                    if !status.success() {
                        eprintln!(
                            "Relay daemon exited with code {}",
                            status.code().unwrap_or(-1)
                        );
                    }
                } else {
                    eprintln!("Install succeeded but binary not found on PATH.");
                    eprintln!(
                        "Try: cargo install --git https://github.com/broomva/life.git life-relayd"
                    );
                }
            }
            _ => {
                eprintln!("Auto-install failed. Falling back to lightweight mode.");
                eprintln!("  To install manually:");
                eprintln!(
                    "    cargo install --git https://github.com/broomva/life.git life-relayd"
                );
                eprintln!();
                run_lightweight_relay(&api_base, &token.unwrap(), bind).await?;
            }
        }
    }

    Ok(())
}

/// Lightweight relay: register node + poll loop (no PTY spawning).
/// Useful for testing the connection or when the Rust daemon isn't installed.
async fn run_lightweight_relay(api_base: &str, token: &str, _bind: &str) -> BroomvaResult<()> {
    let http = reqwest::Client::new();
    let hostname = hostname::get()
        .map(|h| h.to_string_lossy().into_owned())
        .unwrap_or_else(|_| "unknown".to_string());

    // Register node
    eprintln!("Registering node...");
    let connect_res = http
        .post(format!("{api_base}/api/relay/connect"))
        .header("Authorization", format!("Bearer {token}"))
        .json(&serde_json::json!({
            "name": hostname,
            "hostname": hostname,
            "capabilities": ["claude-code"]
        }))
        .send()
        .await
        .map_err(|e| crate::error::BroomvaError::Api {
            status: 0,
            message: format!("connect failed: {e}"),
            body: None,
        })?;

    if !connect_res.status().is_success() {
        let body = connect_res.text().await.unwrap_or_default();
        eprintln!("Node registration failed: {body}");
        return Ok(());
    }

    let connect_body: serde_json::Value = connect_res.json().await.unwrap_or_default();
    let node_id = connect_body
        .get("nodeId")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown");
    let status = connect_body
        .get("status")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown");

    eprintln!("Node {status}: {node_id}");
    eprintln!("Polling for commands (Ctrl+C to stop)...");
    eprintln!();
    eprintln!("NOTE: Lightweight mode — cannot spawn agent sessions.");
    eprintln!("      Install life-relayd for full functionality.");
    eprintln!();

    loop {
        tokio::select! {
            _ = tokio::signal::ctrl_c() => {
                eprintln!();
                eprintln!("Shutting down relay...");
                break;
            }
            _ = tokio::time::sleep(std::time::Duration::from_secs(2)) => {
                let poll_res = http
                    .get(format!("{api_base}/api/relay/poll?nodeId={node_id}"))
                    .header("Authorization", format!("Bearer {token}"))
                    .send()
                    .await;

                match poll_res {
                    Ok(resp) if resp.status().is_success() => {
                        if let Ok(body) = resp.json::<serde_json::Value>().await {
                            if let Some(cmd) = body.get("command") {
                                if !cmd.is_null() {
                                    let cmd_type = cmd.get("type").and_then(|t| t.as_str()).unwrap_or("?");
                                    eprintln!("  Command received: {cmd_type} (cannot execute in lightweight mode)");
                                }
                            }
                        }
                    }
                    Ok(resp) => {
                        eprintln!("  Poll error: HTTP {}", resp.status());
                    }
                    Err(e) => {
                        eprintln!("  Poll error: {e}");
                    }
                }
            }
        }
    }

    Ok(())
}

/// Stop the relay daemon.
pub async fn handle_stop() -> BroomvaResult<()> {
    let client = reqwest::Client::new();
    match client
        .get("http://127.0.0.1:3004/health")
        .timeout(std::time::Duration::from_secs(2))
        .send()
        .await
    {
        Ok(resp) if resp.status().is_success() => {
            eprintln!("Relay daemon is running on port 3004.");
            eprintln!("Send Ctrl+C to the running process, or:");
            eprintln!("  kill $(lsof -ti :3004)");
        }
        _ => {
            eprintln!("No relay daemon running on port 3004.");
        }
    }
    Ok(())
}

/// Show relay status — nodes, sessions, daemon health.
pub async fn handle_status(client: &BroomvaClient, _format: OutputFormat) -> BroomvaResult<()> {
    // Check local daemon health
    let reqw = reqwest::Client::new();
    let daemon_running = reqw
        .get("http://127.0.0.1:3004/health")
        .timeout(std::time::Duration::from_secs(2))
        .send()
        .await
        .is_ok_and(|r| r.status().is_success());

    // Check remote nodes
    let url = format!("{}/api/relay/nodes", client.base_url());
    let mut req = client.raw_client().get(&url);
    if let Ok(Some(t)) = config::read_config().map(|c| c.token) {
        req = req.header("Authorization", format!("Bearer {t}"));
    }
    let res = req
        .send()
        .await
        .map_err(|e| crate::error::BroomvaError::Api {
            status: 0,
            message: format!("request failed: {e}"),
            body: None,
        })?;

    let body: serde_json::Value = res.json().await.unwrap_or_default();

    eprintln!();
    eprintln!("  Relay Status");
    eprintln!("  ─────────────────────────────");
    eprintln!(
        "  Authenticated:  {}",
        if config::resolve_token(None)?.is_some() {
            "yes"
        } else {
            "no"
        }
    );
    eprintln!(
        "  Local daemon:   {}",
        if daemon_running {
            "running (port 3004)"
        } else {
            "not running"
        }
    );
    eprintln!(
        "  Relayd binary:  {}",
        find_relayd_binary().as_deref().unwrap_or("not found")
    );

    if let Some(nodes) = body.get("nodes").and_then(|n| n.as_array()) {
        eprintln!();
        eprintln!("  Nodes ({}):", nodes.len());
        for node in nodes {
            let name = node.get("name").and_then(|v| v.as_str()).unwrap_or("?");
            let status = node.get("status").and_then(|v| v.as_str()).unwrap_or("?");
            let host = node.get("hostname").and_then(|v| v.as_str()).unwrap_or("");
            let indicator = match status {
                "online" => "●",
                "degraded" => "◐",
                _ => "○",
            };
            eprintln!("    {indicator} {name} ({host}) — {status}");
        }
    }

    if let Some(metrics) = body.get("metrics") {
        let online = metrics
            .get("nodesOnline")
            .and_then(|n| n.as_u64())
            .unwrap_or(0);
        let active = metrics
            .get("sessionsActive")
            .and_then(|n| n.as_u64())
            .unwrap_or(0);
        eprintln!();
        eprintln!("  {online} node(s) online, {active} active session(s)");
    }

    if !daemon_running {
        eprintln!();
        eprintln!("  Run `broomva relay start` to connect this machine.");
    }

    eprintln!();
    Ok(())
}

/// List relay sessions.
pub async fn handle_sessions(client: &BroomvaClient, _format: OutputFormat) -> BroomvaResult<()> {
    let url = format!("{}/api/relay/sessions", client.base_url());
    let mut req = client.raw_client().get(&url);
    if let Ok(Some(t)) = config::read_config().map(|c| c.token) {
        req = req.header("Authorization", format!("Bearer {t}"));
    }
    let res = req
        .send()
        .await
        .map_err(|e| crate::error::BroomvaError::Api {
            status: 0,
            message: format!("request failed: {e}"),
            body: None,
        })?;

    let body: serde_json::Value = res.json().await.unwrap_or_default();

    if let Some(sessions) = body.get("sessions").and_then(|s| s.as_array()) {
        if sessions.is_empty() {
            eprintln!("No active relay sessions.");
            return Ok(());
        }
        eprintln!("Relay Sessions:");
        for session in sessions {
            let name = session
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("untitled");
            let stype = session
                .get("sessionType")
                .and_then(|v| v.as_str())
                .unwrap_or("?");
            let status = session
                .get("status")
                .and_then(|v| v.as_str())
                .unwrap_or("?");
            let workdir = session
                .get("workdir")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            eprintln!("  [{status:9}] [{stype:11}] {name}  {workdir}");
        }
    }

    Ok(())
}
