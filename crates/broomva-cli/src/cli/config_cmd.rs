use crate::cli::output::{OutputFormat, print_json, print_kv};
use crate::config;
use crate::config::types::DaemonConfig;
use crate::error::{BroomvaError, BroomvaResult};

pub async fn handle_set(key: &str, value: &str) -> BroomvaResult<()> {
    config::update_config(|c| match key {
        "apiBase" | "api-base" | "api_base" => {
            c.api_base = Some(value.to_string());
        }
        "defaultFormat" | "default-format" | "default_format" => {
            c.default_format = Some(value.to_string());
        }
        k if k.starts_with("daemon.") => {
            let daemon = c.daemon.get_or_insert_with(DaemonConfig::default);
            let sub = &k["daemon.".len()..];
            match sub {
                "symphonyUrl" | "symphony-url" | "symphony_url" => {
                    daemon.symphony_url = Some(value.to_string());
                }
                "arcanUrl" | "arcan-url" | "arcan_url" => {
                    daemon.arcan_url = Some(value.to_string());
                }
                "lagoUrl" | "lago-url" | "lago_url" => {
                    daemon.lago_url = Some(value.to_string());
                }
                "autonomicUrl" | "autonomic-url" | "autonomic_url" => {
                    daemon.autonomic_url = Some(value.to_string());
                }
                "heartbeatIntervalMs" | "heartbeat-interval-ms" | "heartbeat_interval_ms" => {
                    if let Ok(v) = value.parse() {
                        daemon.heartbeat_interval_ms = Some(v);
                    }
                }
                "dashboardPort" | "dashboard-port" | "dashboard_port" => {
                    if let Ok(v) = value.parse() {
                        daemon.dashboard_port = Some(v);
                    }
                }
                "incidentThreshold" | "incident-threshold" | "incident_threshold" => {
                    if let Ok(v) = value.parse() {
                        daemon.incident_threshold = Some(v);
                    }
                }
                _ => {
                    eprintln!("  Unknown daemon config key: {sub}");
                }
            }
        }
        _ => {
            eprintln!("  Unknown config key: {key}");
            eprintln!("  Valid keys: apiBase, defaultFormat, daemon.<subkey>");
        }
    })?;
    println!("  Set {key} = {value}");
    Ok(())
}

pub async fn handle_get(key: Option<&str>, format: OutputFormat) -> BroomvaResult<()> {
    let cfg = config::read_config()?;

    match key {
        None => {
            if format == OutputFormat::Json {
                print_json(&cfg);
            } else {
                print_kv("API Base", cfg.api_base.as_deref().unwrap_or("(default)"));
                print_kv(
                    "Default Format",
                    cfg.default_format.as_deref().unwrap_or("table"),
                );
                print_kv(
                    "Token",
                    if cfg.token.is_some() {
                        "(set)"
                    } else {
                        "(not set)"
                    },
                );
                if let Some(ref d) = cfg.daemon {
                    println!();
                    println!("  Daemon:");
                    if let Some(ref url) = d.symphony_url {
                        print_kv("    Symphony URL", url);
                    }
                    if let Some(ref url) = d.arcan_url {
                        print_kv("    Arcan URL", url);
                    }
                    if let Some(ref url) = d.lago_url {
                        print_kv("    Lago URL", url);
                    }
                    if let Some(ref url) = d.autonomic_url {
                        print_kv("    Autonomic URL", url);
                    }
                    if let Some(interval) = d.heartbeat_interval_ms {
                        print_kv("    Heartbeat Interval", &format!("{interval}ms"));
                    }
                    if let Some(port) = d.dashboard_port {
                        print_kv("    Dashboard Port", &port.to_string());
                    }
                }
            }
        }
        Some(key) => {
            let value = match key {
                "token" => cfg.token.clone(),
                "tokenExpiresAt" | "token_expires_at" => cfg.token_expires_at.clone(),
                "apiBase" | "api_base" => cfg.api_base.clone(),
                "defaultFormat" | "default_format" => cfg.default_format.clone(),
                k if k.starts_with("daemon.") => {
                    let sub = &k["daemon.".len()..];
                    cfg.daemon.as_ref().and_then(|d| match sub {
                        "symphonyUrl" | "symphony_url" => d.symphony_url.clone(),
                        "arcanUrl" | "arcan_url" => d.arcan_url.clone(),
                        "lagoUrl" | "lago_url" => d.lago_url.clone(),
                        "autonomicUrl" | "autonomic_url" => d.autonomic_url.clone(),
                        "heartbeatIntervalMs" | "heartbeat_interval_ms" => {
                            d.heartbeat_interval_ms.map(|v| v.to_string())
                        }
                        "dashboardPort" | "dashboard_port" => {
                            d.dashboard_port.map(|v| v.to_string())
                        }
                        "incidentThreshold" | "incident_threshold" => {
                            d.incident_threshold.map(|v| v.to_string())
                        }
                        _ => None,
                    })
                }
                _ => {
                    return Err(BroomvaError::User(format!("unknown config key: {key}")));
                }
            };
            match value {
                Some(v) => println!("{v}"),
                None => println!("(not set)"),
            }
        }
    }
    Ok(())
}

pub async fn handle_reset() -> BroomvaResult<()> {
    config::write_config(&config::types::CliConfig::default())?;
    println!("  Config reset to defaults.");
    Ok(())
}
