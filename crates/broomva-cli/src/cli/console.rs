use std::process::Command as ProcessCommand;

use crate::api::BroomvaClient;
use crate::cli::output::{OutputFormat, print_json, print_table};
use crate::error::BroomvaResult;

const CONSOLE_URL: &str = "https://broomva.tech/console";

pub async fn handle_console_open() -> BroomvaResult<()> {
    println!("  Opening {CONSOLE_URL} ...");

    let result = if cfg!(target_os = "macos") {
        ProcessCommand::new("open").arg(CONSOLE_URL).status()
    } else {
        ProcessCommand::new("xdg-open").arg(CONSOLE_URL).status()
    };

    match result {
        Ok(status) if status.success() => Ok(()),
        Ok(status) => {
            eprintln!("  Browser exited with status: {status}");
            Ok(())
        }
        Err(e) => {
            eprintln!("  Failed to open browser: {e}");
            eprintln!("  Visit {CONSOLE_URL} manually.");
            Ok(())
        }
    }
}

pub async fn handle_console_status(
    client: &BroomvaClient,
    format: OutputFormat,
) -> BroomvaResult<()> {
    let health = client.get_console_health().await?;

    if format == OutputFormat::Json {
        print_json(&health);
        return Ok(());
    }

    let services = [
        ("arcan", &health.arcan),
        ("lago", &health.lago),
        ("autonomic", &health.autonomic),
        ("haima", &health.haima),
    ];

    let rows: Vec<Vec<String>> = services
        .iter()
        .map(|(name, svc)| {
            vec![
                name.to_string(),
                format_status(&svc.status),
                svc.latency_ms
                    .map(|ms| format!("{ms}ms"))
                    .unwrap_or_else(|| "-".into()),
            ]
        })
        .collect();

    print_table(&["service", "status", "latency"], &rows, format);

    if let Some(ref ts) = health.timestamp {
        println!();
        println!("  Last checked: {ts}");
    }

    Ok(())
}

pub async fn handle_console_sessions(
    client: &BroomvaClient,
    format: OutputFormat,
) -> BroomvaResult<()> {
    let sessions = client.list_agent_sessions().await?;

    if format == OutputFormat::Json {
        print_json(&sessions);
        return Ok(());
    }

    let rows: Vec<Vec<String>> = sessions
        .iter()
        .map(|s| {
            vec![
                s.id.clone(),
                s.status.clone().unwrap_or_default(),
                s.agent.clone().unwrap_or_default(),
                s.started_at.clone().unwrap_or_default(),
                s.ended_at.clone().unwrap_or_default(),
            ]
        })
        .collect();

    print_table(
        &["id", "status", "agent", "started", "ended"],
        &rows,
        format,
    );
    Ok(())
}

fn format_status(status: &str) -> String {
    match status.to_lowercase().as_str() {
        "healthy" | "ok" | "up" => format!("\x1b[32m{status}\x1b[0m"),
        "degraded" | "slow" => format!("\x1b[33m{status}\x1b[0m"),
        "down" | "error" | "unhealthy" => format!("\x1b[31m{status}\x1b[0m"),
        _ => status.to_string(),
    }
}
