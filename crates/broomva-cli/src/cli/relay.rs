//! Relay subcommand handlers — remote agent session management.
//!
//! `broomva relay auth` registers this machine as a relay node using the
//! existing device authorization flow, with relay-specific capabilities.

use crate::api::BroomvaClient;
use crate::cli::output::OutputFormat;
use crate::config;
use crate::error::BroomvaResult;

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
pub async fn handle_start(_client: &BroomvaClient, bind: &str) -> BroomvaResult<()> {
    eprintln!("Starting relay daemon on {bind}...");
    eprintln!("Not yet implemented — use `cargo run -p life-relayd -- start --bind {bind}` from core/life/relay/");
    Ok(())
}

/// Stop the relay daemon.
pub async fn handle_stop() -> BroomvaResult<()> {
    eprintln!("Stopping relay daemon...");
    eprintln!("Not yet implemented.");
    Ok(())
}

/// Show relay status.
pub async fn handle_status(client: &BroomvaClient, _format: OutputFormat) -> BroomvaResult<()> {
    let url = format!("{}/api/relay/nodes", client.base_url());
    let mut req = client.raw_client().get(&url);
    if let Ok(Some(t)) = config::read_config().map(|c| c.token) {
        req = req.header("Authorization", format!("Bearer {t}"));
    }
    let res = req.send().await.map_err(|e| {
        crate::error::BroomvaError::Api {
            status: 0,
            message: format!("request failed: {e}"),
            body: None,
        }
    })?;

    let body: serde_json::Value = res.json().await.unwrap_or_default();

    if let Some(nodes) = body.get("nodes").and_then(|n| n.as_array()) {
        eprintln!("Relay Nodes: {}", nodes.len());
        for node in nodes {
            let name = node.get("name").and_then(|v| v.as_str()).unwrap_or("?");
            let status = node.get("status").and_then(|v| v.as_str()).unwrap_or("?");
            let host = node.get("hostname").and_then(|v| v.as_str()).unwrap_or("");
            eprintln!("  [{status:7}] {name} ({host})");
        }
    }

    if let Some(metrics) = body.get("metrics") {
        let online = metrics.get("nodesOnline").and_then(|n| n.as_u64()).unwrap_or(0);
        let active = metrics.get("sessionsActive").and_then(|n| n.as_u64()).unwrap_or(0);
        eprintln!();
        eprintln!("Online: {online} nodes, {active} active sessions");
    }

    Ok(())
}

/// List relay sessions.
pub async fn handle_sessions(client: &BroomvaClient, _format: OutputFormat) -> BroomvaResult<()> {
    let url = format!("{}/api/relay/sessions", client.base_url());
    let mut req = client.raw_client().get(&url);
    if let Ok(Some(t)) = config::read_config().map(|c| c.token) {
        req = req.header("Authorization", format!("Bearer {t}"));
    }
    let res = req.send().await.map_err(|e| {
        crate::error::BroomvaError::Api {
            status: 0,
            message: format!("request failed: {e}"),
            body: None,
        }
    })?;

    let body: serde_json::Value = res.json().await.unwrap_or_default();

    if let Some(sessions) = body.get("sessions").and_then(|s| s.as_array()) {
        if sessions.is_empty() {
            eprintln!("No active relay sessions.");
            return Ok(());
        }
        eprintln!("Relay Sessions:");
        for session in sessions {
            let name = session.get("name").and_then(|v| v.as_str()).unwrap_or("untitled");
            let stype = session.get("sessionType").and_then(|v| v.as_str()).unwrap_or("?");
            let status = session.get("status").and_then(|v| v.as_str()).unwrap_or("?");
            let workdir = session.get("workdir").and_then(|v| v.as_str()).unwrap_or("");
            eprintln!("  [{status:9}] [{stype:11}] {name}  {workdir}");
        }
    }

    Ok(())
}
