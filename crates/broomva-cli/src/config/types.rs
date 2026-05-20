use serde::{Deserialize, Serialize};

/// Top-level CLI configuration, stored at `~/.broomva/config.json`.
///
/// Uses `camelCase` serialization for backward compatibility with the TS CLI.
///
/// `lifegw_token` (BRO-1203) is the ES256 JWT minted by the device-code
/// flow's `mintTier1ForConsumer()` — accepted by production lifegw
/// (`life.broomva.tech`) which rejects the HS256 `token` field above.
/// The CLI prefers `lifegw_token` when the gateway URL host points at a
/// lifegw deployment; broomva.tech API routes (prompts / skills / etc.)
/// continue to use `token`. Both fields are `Option<>` so older
/// `config.json` files (pre-v0.8.1) deserialize cleanly.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CliConfig {
    pub token: Option<String>,
    pub token_expires_at: Option<String>,
    pub api_base: Option<String>,
    pub default_format: Option<String>,
    pub daemon: Option<DaemonConfig>,
    /// ES256 lifegw Tier-1 JWT (BRO-1203). Minted by the device-code
    /// flow alongside `token`; published JWKS at
    /// `https://broomva.tech/api/auth/jwks.json` is what production
    /// lifegw verifies against.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub lifegw_token: Option<String>,
    /// Epoch seconds when `lifegw_token` expires. Matches the
    /// `expiresAt` field returned by `mintTier1ForConsumer`. 15 min TTL
    /// per Spec C₃ §5.4.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub lifegw_token_expires_at: Option<u64>,
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
            lifegw_token: Some("eyJhbGciOiJFUzI1NiIsImtpZCI6ImQwM2I2YzJmYzAwM2I1NGYifQ.x.y".into()),
            lifegw_token_expires_at: Some(1_900_000_000),
        };

        let json = serde_json::to_string_pretty(&config).unwrap();
        assert!(json.contains("tokenExpiresAt"));
        assert!(json.contains("apiBase"));
        assert!(json.contains("defaultFormat"));
        assert!(json.contains("heartbeatIntervalMs"));
        assert!(json.contains("dashboardPort"));
        assert!(json.contains("symphonyUrl"));
        assert!(json.contains("incidentThreshold"));
        // BRO-1203 — new ES256 lifegw token fields use camelCase.
        assert!(json.contains("lifegwToken"));
        assert!(json.contains("lifegwTokenExpiresAt"));

        let parsed: CliConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.token.as_deref(), Some("tok_abc"));
        assert_eq!(
            parsed.daemon.as_ref().unwrap().heartbeat_interval_ms,
            Some(30_000)
        );
        assert_eq!(
            parsed.lifegw_token.as_deref(),
            Some("eyJhbGciOiJFUzI1NiIsImtpZCI6ImQwM2I2YzJmYzAwM2I1NGYifQ.x.y")
        );
        assert_eq!(parsed.lifegw_token_expires_at, Some(1_900_000_000));
    }

    #[test]
    fn deserialize_empty_object() {
        let config: CliConfig = serde_json::from_str("{}").unwrap();
        assert!(config.token.is_none());
        assert!(config.daemon.is_none());
        // BRO-1203 — backward-compat: pre-v0.8.1 configs lack these
        // fields entirely; the new fields default to None.
        assert!(config.lifegw_token.is_none());
        assert!(config.lifegw_token_expires_at.is_none());
    }

    #[test]
    fn deserialize_legacy_v0_8_0_config_without_lifegw_fields() {
        // BRO-1203 — back-compat regression guard. Verbatim shape a
        // pre-v0.8.1 install would have on disk after `broomva auth
        // login` against the old server.
        let legacy = r#"{
            "token": "hs256.legacy.token",
            "tokenExpiresAt": "2026-12-31T00:00:00Z",
            "apiBase": "https://broomva.tech"
        }"#;
        let config: CliConfig = serde_json::from_str(legacy).unwrap();
        assert_eq!(config.token.as_deref(), Some("hs256.legacy.token"));
        assert!(config.lifegw_token.is_none());
        assert!(config.lifegw_token_expires_at.is_none());
    }
}
