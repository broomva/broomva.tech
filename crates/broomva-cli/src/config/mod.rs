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

/// Clear stored credentials.
pub fn clear_token() -> BroomvaResult<()> {
    update_config(|c| {
        c.token = None;
        c.token_expires_at = None;
    })
}
