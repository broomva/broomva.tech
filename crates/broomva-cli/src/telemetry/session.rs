//! Session ID helper — generates and caches a per-shell-session UUID at
//! `~/.broomva/session` with a 24h TTL. Lets the evals dashboard group
//! all the prompt pulls from one shell session together.

use std::fs;
use std::path::PathBuf;
use std::time::{Duration, SystemTime};

use crate::config::constants::config_dir;

const SESSION_TTL: Duration = Duration::from_secs(24 * 60 * 60);

fn session_path() -> PathBuf {
    if let Ok(p) = std::env::var("BROOMVA_SESSION_PATH") {
        return PathBuf::from(p);
    }
    config_dir().join("session")
}

/// Return the cached session ID, or generate a new one (and cache it) if
/// the cache is missing or stale.
pub fn get_or_create_session_id() -> String {
    if let Some(cached) = read_cached_session() {
        return cached;
    }
    let new_id = uuid::Uuid::new_v4().to_string();
    let _ = write_session(&new_id); // best-effort: silent if write fails
    new_id
}

fn read_cached_session() -> Option<String> {
    let path = session_path();
    let meta = fs::metadata(&path).ok()?;
    let modified = meta.modified().ok()?;
    let age = SystemTime::now().duration_since(modified).ok()?;
    if age > SESSION_TTL {
        return None;
    }
    let content = fs::read_to_string(&path).ok()?;
    let trimmed = content.trim();
    if trimmed.is_empty() {
        return None;
    }
    // Validate it parses as a UUID — defensive against corrupted cache
    uuid::Uuid::parse_str(trimmed).ok()?;
    Some(trimmed.to_string())
}

fn write_session(id: &str) -> std::io::Result<()> {
    let dir = config_dir();
    if !dir.exists() {
        fs::create_dir_all(&dir)?;
    }
    fs::write(session_path(), id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    /// Helper: scope a temp session file via env override + shared lock.
    fn with_temp_session<F: FnOnce()>(f: F) {
        let _guard = crate::telemetry::TELEMETRY_ENV_LOCK.lock().unwrap();
        let tmp = tempdir().unwrap();
        let path = tmp.path().join("session");
        let prev = std::env::var("BROOMVA_SESSION_PATH").ok();
        unsafe { std::env::set_var("BROOMVA_SESSION_PATH", &path) };
        f();
        match prev {
            Some(v) => unsafe { std::env::set_var("BROOMVA_SESSION_PATH", v) },
            None => unsafe { std::env::remove_var("BROOMVA_SESSION_PATH") },
        }
        // tmp is dropped here, cleaning up the file
    }

    #[test]
    fn get_or_create_returns_valid_uuid() {
        with_temp_session(|| {
            let id = get_or_create_session_id();
            assert!(uuid::Uuid::parse_str(&id).is_ok(), "got: {id}");
        });
    }

    #[test]
    fn get_or_create_is_stable_within_window() {
        with_temp_session(|| {
            let id1 = get_or_create_session_id();
            let id2 = get_or_create_session_id();
            assert_eq!(id1, id2);
        });
    }
}
