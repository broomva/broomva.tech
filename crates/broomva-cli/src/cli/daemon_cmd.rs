use std::sync::Arc;
use std::time::Duration;

use tokio::sync::RwLock;
use tokio_util::sync::CancellationToken;

use crate::cli::output::{OutputFormat, print_json, print_kv, print_table};
use crate::config;
use crate::config::constants;
use crate::daemon::dashboard;
use crate::daemon::heartbeat::{HeartbeatLoop, HeartbeatState};
use crate::daemon::logger;
use crate::daemon::process;
use crate::daemon::sensors::{self, SensorContext};
use crate::daemon::symphony_client::SymphonyHttpClient;
use crate::error::BroomvaResult;

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, clap::ValueEnum)]
pub enum EnvTarget {
    Local,
    #[default]
    Railway,
}

pub struct StartOpts {
    pub env: EnvTarget,
    pub port: Option<u16>,
    pub interval: Option<u64>,
    pub detach: bool,
    pub symphony_url: Option<String>,
    pub arcan_url: Option<String>,
    pub lago_url: Option<String>,
    pub autonomic_url: Option<String>,
}

pub async fn handle_start(opts: StartOpts) -> BroomvaResult<()> {
    let StartOpts {
        env,
        port,
        interval,
        detach,
        symphony_url,
        arcan_url,
        lago_url,
        autonomic_url,
    } = opts;
    if process::is_running() {
        println!(
            "  Daemon is already running (PID: {}).",
            process::read_pid().unwrap_or(0)
        );
        return Ok(());
    }

    if detach {
        println!("  Detached mode: re-launching as background process...");
        let exe = std::env::current_exe()?;
        let mut args = vec!["daemon".to_string(), "start".to_string()];
        args.push("--env".into());
        args.push(match env {
            EnvTarget::Local => "local".into(),
            EnvTarget::Railway => "railway".into(),
        });
        if let Some(p) = port {
            args.push("--port".into());
            args.push(p.to_string());
        }
        if let Some(i) = interval {
            args.push("--interval".into());
            args.push(i.to_string());
        }
        // Don't pass --detach again to avoid recursion.

        let child = std::process::Command::new(exe)
            .args(&args)
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()?;

        println!("  Daemon started (PID: {}).", child.id());
        return Ok(());
    }

    // Foreground mode.
    let cfg = config::read_config()?;
    let daemon_cfg = cfg.daemon.unwrap_or_default();

    let dashboard_port = port
        .or(daemon_cfg.dashboard_port)
        .unwrap_or(constants::DEFAULT_DASHBOARD_PORT);
    let heartbeat_interval = interval
        .or(daemon_cfg.heartbeat_interval_ms)
        .unwrap_or(constants::DEFAULT_HEARTBEAT_INTERVAL_MS);

    // Resolve URLs based on env target + overrides.
    let broomva_url = match env {
        EnvTarget::Local => constants::LOCAL_BROOMVA_URL.to_string(),
        EnvTarget::Railway => cfg
            .api_base
            .unwrap_or_else(|| constants::DEFAULT_API_BASE.to_string()),
    };
    let symphony = symphony_url
        .or(daemon_cfg.symphony_url)
        .or_else(|| (env == EnvTarget::Local).then(|| constants::LOCAL_SYMPHONY_URL.to_string()));
    let arcan = arcan_url
        .or(daemon_cfg.arcan_url)
        .or_else(|| (env == EnvTarget::Local).then(|| constants::LOCAL_ARCAN_URL.to_string()));
    let lago = lago_url
        .or(daemon_cfg.lago_url)
        .or_else(|| (env == EnvTarget::Local).then(|| constants::LOCAL_LAGO_URL.to_string()));
    let autonomic = autonomic_url
        .or(daemon_cfg.autonomic_url)
        .or_else(|| (env == EnvTarget::Local).then(|| constants::LOCAL_AUTONOMIC_URL.to_string()));

    // Write PID.
    process::write_pid()?;

    let cancel = CancellationToken::new();
    let state = Arc::new(RwLock::new(HeartbeatState::default()));

    let http_client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .connect_timeout(Duration::from_secs(5))
        .build()
        .expect("failed to create HTTP client");

    let sensor_ctx = SensorContext {
        broomva_url: broomva_url.clone(),
        symphony_url: symphony.clone(),
        arcan_url: arcan.clone(),
        lago_url: lago.clone(),
        autonomic_url: autonomic.clone(),
        client: http_client,
    };

    let heartbeat = HeartbeatLoop::new(
        sensors::default_sensors(),
        heartbeat_interval,
        Arc::clone(&state),
        cancel.clone(),
        sensor_ctx,
    );

    // Symphony client for dashboard.
    let symphony_client = symphony.map(|url| {
        let token = cfg.token.clone();
        SymphonyHttpClient::new(url, token)
    });

    println!("  broomva daemon starting");
    println!("    Dashboard: http://0.0.0.0:{dashboard_port}");
    println!("    Heartbeat: every {heartbeat_interval}ms");
    println!("    Target:    {broomva_url}");
    println!();

    // Set up signal handling for graceful shutdown.
    let cancel_sig = cancel.clone();
    tokio::spawn(async move {
        let _ = tokio::signal::ctrl_c().await;
        tracing::info!("received SIGINT, shutting down");
        cancel_sig.cancel();
    });

    // Run heartbeat and dashboard concurrently.
    let dashboard_handle = tokio::spawn(dashboard::start_dashboard(
        dashboard_port,
        Arc::clone(&state),
        symphony_client,
    ));
    let heartbeat_handle = tokio::spawn(async move { heartbeat.run().await });

    // Wait for cancellation.
    cancel.cancelled().await;

    // Give a moment for tasks to wind down.
    tokio::time::sleep(Duration::from_millis(500)).await;
    dashboard_handle.abort();
    heartbeat_handle.abort();

    process::remove_pid();
    println!("\n  Daemon stopped.");
    Ok(())
}

pub async fn handle_stop() -> BroomvaResult<()> {
    match process::stop_daemon()? {
        true => println!("  Daemon stopped."),
        false => println!("  No running daemon found."),
    }
    Ok(())
}

pub async fn handle_status(format: OutputFormat) -> BroomvaResult<()> {
    let running = process::is_running();
    let pid = process::read_pid();

    if format == OutputFormat::Json {
        let status = serde_json::json!({
            "running": running,
            "pid": pid,
        });
        crate::cli::output::print_json_value(&status);
        return Ok(());
    }

    if running {
        print_kv("Status", "running");
        if let Some(pid) = pid {
            print_kv("PID", &pid.to_string());
        }
    } else {
        print_kv("Status", "stopped");
    }
    Ok(())
}

pub async fn handle_logs(
    lines: usize,
    level: Option<&str>,
    format: OutputFormat,
) -> BroomvaResult<()> {
    let entries = logger::read_logs(lines, level)?;

    if format == OutputFormat::Json {
        print_json(&entries);
        return Ok(());
    }

    if entries.is_empty() {
        println!("  (no log entries)");
        return Ok(());
    }

    let rows: Vec<Vec<String>> = entries
        .iter()
        .map(|e| {
            vec![
                e.timestamp.clone(),
                e.level.clone(),
                e.sensor.clone().unwrap_or_default(),
                e.message.clone(),
            ]
        })
        .collect();

    print_table(&["time", "level", "sensor", "message"], &rows, format);
    Ok(())
}

pub async fn handle_tasks(all: bool, format: OutputFormat) -> BroomvaResult<()> {
    // Daemon tasks are just a view of the configured sensors.
    let sensor_names: Vec<(&str, &str)> = vec![
        ("site_health", "Site Health"),
        ("api_health", "API Health"),
        ("railway_health", "Railway Services"),
    ];

    if format == OutputFormat::Json {
        let tasks: Vec<serde_json::Value> = sensor_names
            .iter()
            .map(|(id, name)| {
                serde_json::json!({
                    "id": id,
                    "name": name,
                    "active": true,
                })
            })
            .collect();
        print_json(&tasks);
        return Ok(());
    }

    let rows: Vec<Vec<String>> = sensor_names
        .iter()
        .map(|(id, name)| vec![id.to_string(), name.to_string(), "active".to_string()])
        .collect();

    let _ = all; // all sensors are always shown
    print_table(&["id", "name", "status"], &rows, format);
    Ok(())
}
