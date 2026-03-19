use serde::{Deserialize, Serialize};

/// Top-level CLI configuration, stored at `~/.broomva/config.json`.
///
/// Uses `camelCase` serialization for backward compatibility with the TS CLI.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CliConfig {
    pub token: Option<String>,
    pub token_expires_at: Option<String>,
    pub api_base: Option<String>,
    pub default_format: Option<String>,
    pub daemon: Option<DaemonConfig>,
}

/// Daemon-specific configuration nested under `daemon` in the config file.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DaemonConfig {
    pub heartbeat_interval_ms: Option<u64>,
    pub dashboard_port: Option<u16>,
    pub symphony_url: Option<String>,
    pub arcan_url: Option<String>,
    pub lago_url: Option<String>,
    pub autonomic_url: Option<String>,
    pub incident_threshold: Option<u32>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn camel_case_roundtrip() {
        let config = CliConfig {
            token: Some("tok_abc".into()),
            token_expires_at: Some("2026-12-31T00:00:00Z".into()),
            api_base: Some("https://broomva.tech".into()),
            default_format: Some("table".into()),
            daemon: Some(DaemonConfig {
                heartbeat_interval_ms: Some(30_000),
                dashboard_port: Some(7890),
                symphony_url: Some("https://symphony.example.com".into()),
                arcan_url: None,
                lago_url: None,
                autonomic_url: None,
                incident_threshold: Some(5),
            }),
        };

        let json = serde_json::to_string_pretty(&config).unwrap();
        assert!(json.contains("tokenExpiresAt"));
        assert!(json.contains("apiBase"));
        assert!(json.contains("defaultFormat"));
        assert!(json.contains("heartbeatIntervalMs"));
        assert!(json.contains("dashboardPort"));
        assert!(json.contains("symphonyUrl"));
        assert!(json.contains("incidentThreshold"));

        let parsed: CliConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.token.as_deref(), Some("tok_abc"));
        assert_eq!(
            parsed.daemon.as_ref().unwrap().heartbeat_interval_ms,
            Some(30_000)
        );
    }

    #[test]
    fn deserialize_empty_object() {
        let config: CliConfig = serde_json::from_str("{}").unwrap();
        assert!(config.token.is_none());
        assert!(config.daemon.is_none());
    }
}
