pub mod constants;
pub mod types;

use std::fs;

use crate::error::{BroomvaError, BroomvaResult};
use constants::{config_dir, config_path};
use types::CliConfig;

/// Read the config file, returning `Default` if it doesn't exist.
pub fn read_config() -> BroomvaResult<CliConfig> {
    let path = config_path();
    if !path.exists() {
        return Ok(CliConfig::default());
    }
    let data = fs::read_to_string(&path)?;
    let config: CliConfig = serde_json::from_str(&data)
        .map_err(|e| BroomvaError::Config(format!("invalid config at {}: {e}", path.display())))?;
    Ok(config)
}

/// Write the config file, creating `~/.broomva/` if needed.
pub fn write_config(config: &CliConfig) -> BroomvaResult<()> {
    let dir = config_dir();
    if !dir.exists() {
        fs::create_dir_all(&dir)?;
    }
    let json = serde_json::to_string_pretty(config)?;
    fs::write(config_path(), json)?;
    Ok(())
}

/// Update the config file via a closure.
pub fn update_config<F>(f: F) -> BroomvaResult<()>
where
    F: FnOnce(&mut CliConfig),
{
    let mut config = read_config()?;
    f(&mut config);
    write_config(&config)
}

/// Resolve the auth token from (in priority order):
/// 1. Explicit `--token` flag
/// 2. `BROOMVA_TOKEN` env var
/// 3. Config file
pub fn resolve_token(explicit: Option<&str>) -> BroomvaResult<Option<String>> {
    if let Some(tok) = explicit {
        return Ok(Some(tok.to_string()));
    }
    if let Ok(tok) = std::env::var(constants::ENV_TOKEN)
        && !tok.is_empty()
    {
        return Ok(Some(tok));
    }
    let config = read_config()?;
    Ok(config.token)
}

/// Resolve the API base URL from (in priority order):
/// 1. Explicit `--api-base` flag
/// 2. `BROOMVA_API_BASE` env var
/// 3. Config file
/// 4. Default
pub fn resolve_api_base(explicit: Option<&str>) -> BroomvaResult<String> {
    if let Some(base) = explicit {
        return Ok(base.to_string());
    }
    if let Ok(base) = std::env::var(constants::ENV_API_BASE)
        && !base.is_empty()
    {
        return Ok(base);
    }
    let config = read_config()?;
    Ok(config
        .api_base
        .unwrap_or_else(|| constants::DEFAULT_API_BASE.to_string()))
}

/// Store token and optional expiry in the config.
pub fn store_token(token: &str, expires_at: Option<&str>) -> BroomvaResult<()> {
    update_config(|c| {
        c.token = Some(token.to_string());
        c.token_expires_at = expires_at.map(String::from);
    })
}

/// Store the ES256 lifegw Tier-1 JWT alongside its expiry epoch (BRO-1203).
///
/// `expires_at` is epoch seconds — matches the shape returned by
/// `mintTier1ForConsumer` server-side. Distinct from `store_token`'s
/// HS256 access-token path so a login can persist either or both
/// independently (older servers omit the lifegw field entirely).
pub fn store_lifegw_token(token: &str, expires_at: Option<u64>) -> BroomvaResult<()> {
    update_config(|c| {
        c.lifegw_token = Some(token.to_string());
        c.lifegw_token_expires_at = expires_at;
    })
}

/// Clear stored credentials.
pub fn clear_token() -> BroomvaResult<()> {
    update_config(|c| {
        c.token = None;
        c.token_expires_at = None;
        // BRO-1203 — clear the lifegw side too. Both tokens are issued
        // by the same device-code flow; logging out should drop both.
        c.lifegw_token = None;
        c.lifegw_token_expires_at = None;
    })
}

/// Choose the right token to send to a gateway URL (BRO-1203).
///
/// Precedence:
/// 1. `explicit_token` (e.g. `--token` flag) — always wins, regardless of host.
/// 2. If `gateway_url` host looks like a lifegw deployment AND
///    `cfg.lifegw_token` is set, return it.
/// 3. Otherwise return `cfg.token` (the Better Auth HS256 token).
///
/// "lifegw deployment" = hostname matches `life.broomva.tech`,
/// `lifegw.broomva.tech`, `lifegw-*.up.railway.app`, OR is any
/// non-loopback host paired with an https / wss scheme. The loopback
/// carve-out keeps `lumen-smoke` (`https://127.0.0.1:8443`) on the
/// existing `token` path so dev-token shortcuts (`dev-token-for-…`)
/// keep working.
pub fn token_for_gateway(gateway_url: &str, cfg: &CliConfig) -> Option<String> {
    if is_lifegw_host(gateway_url)
        && let Some(ref tok) = cfg.lifegw_token
    {
        return Some(tok.clone());
    }
    cfg.token.clone()
}

/// Return true if the given gateway URL points at a production-shaped
/// lifegw deployment (not localhost / 127.0.0.1). Used by
/// `token_for_gateway`.
pub fn is_lifegw_host(gateway_url: &str) -> bool {
    // Parse out the host portion. Best-effort — if we can't pull a
    // host we play it safe and return false (preserves the existing
    // `token` codepath).
    let host = match url::Url::parse(gateway_url) {
        Ok(u) => u.host_str().map(|s| s.to_ascii_lowercase()),
        Err(_) => None,
    };
    let Some(host) = host else {
        return false;
    };

    // Carve-out: loopback / localhost → not lifegw (dev path).
    if host == "localhost" || host == "127.0.0.1" || host == "::1" || host.starts_with("127.") {
        return false;
    }

    // Known lifegw deployments.
    if host == "life.broomva.tech"
        || host == "lifegw.broomva.tech"
        || host.ends_with(".up.railway.app")
    {
        return true;
    }

    // Conservative default: any non-loopback host is treated as a
    // lifegw deployment if a lifegw_token is present. The caller's
    // `token_for_gateway` only returns the lifegw token when one is
    // set, so this never blocks legacy callers.
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cfg_with(token: Option<&str>, lifegw: Option<&str>) -> CliConfig {
        CliConfig {
            token: token.map(String::from),
            lifegw_token: lifegw.map(String::from),
            ..Default::default()
        }
    }

    #[test]
    fn token_for_gateway_prefers_lifegw_for_production_host() {
        let c = cfg_with(Some("hs256.token"), Some("es256.token"));
        assert_eq!(
            token_for_gateway("https://life.broomva.tech", &c),
            Some("es256.token".into())
        );
        assert_eq!(
            token_for_gateway("wss://life.broomva.tech/v1/agent/stream", &c),
            Some("es256.token".into())
        );
    }

    #[test]
    fn token_for_gateway_prefers_token_on_localhost() {
        // dev-token-for-* shortcuts live on the `token` field; the
        // lumen-smoke dev path must NOT route to the ES256 token.
        let c = cfg_with(Some("dev-token-for-test"), Some("es256.token"));
        assert_eq!(
            token_for_gateway("https://127.0.0.1:8443", &c),
            Some("dev-token-for-test".into())
        );
        assert_eq!(
            token_for_gateway("wss://localhost:8443", &c),
            Some("dev-token-for-test".into())
        );
    }

    #[test]
    fn token_for_gateway_falls_back_to_token_when_no_lifegw_token() {
        // Pre-v0.8.1 config — only `token` is set. Production
        // gateway URL still gets the HS256 token (backward-compat
        // failure mode is the original BRO-1203 401, not silent
        // dropping of credentials).
        let c = cfg_with(Some("hs256.legacy.token"), None);
        assert_eq!(
            token_for_gateway("https://life.broomva.tech", &c),
            Some("hs256.legacy.token".into())
        );
    }

    #[test]
    fn token_for_gateway_returns_none_when_no_credentials() {
        let c = cfg_with(None, None);
        assert_eq!(token_for_gateway("https://life.broomva.tech", &c), None);
    }

    #[test]
    fn token_for_gateway_handles_railway_preview_deployments() {
        let c = cfg_with(Some("hs256"), Some("es256"));
        assert_eq!(
            token_for_gateway("https://lifegw-feat-x.up.railway.app", &c),
            Some("es256".into())
        );
    }

    #[test]
    fn token_for_gateway_handles_malformed_url_safely() {
        // Non-URL gateway string → not a lifegw host → falls through
        // to `token`. Never panic.
        let c = cfg_with(Some("hs256"), Some("es256"));
        assert_eq!(token_for_gateway("not a url", &c), Some("hs256".into()));
    }
}
