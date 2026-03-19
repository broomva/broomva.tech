use std::path::PathBuf;

/// Default API base URL (production).
pub const DEFAULT_API_BASE: &str = "https://broomva.tech";

/// Default dashboard port for the daemon.
pub const DEFAULT_DASHBOARD_PORT: u16 = 7890;

/// Default heartbeat interval in milliseconds.
pub const DEFAULT_HEARTBEAT_INTERVAL_MS: u64 = 60_000;

/// Environment variable names.
pub const ENV_API_BASE: &str = "BROOMVA_API_BASE";
pub const ENV_TOKEN: &str = "BROOMVA_TOKEN";

/// PID file name within the config directory.
pub const PID_FILE: &str = "daemon.pid";

/// Log file name within the config directory.
pub const LOG_FILE: &str = "daemon.log";

/// Config file name.
pub const CONFIG_FILE: &str = "config.json";

/// Local-mode URLs for `--env local`.
pub const LOCAL_BROOMVA_URL: &str = "http://localhost:3000";
pub const LOCAL_SYMPHONY_URL: &str = "http://localhost:8080";
pub const LOCAL_ARCAN_URL: &str = "http://localhost:8081";
pub const LOCAL_LAGO_URL: &str = "http://localhost:8082";
pub const LOCAL_AUTONOMIC_URL: &str = "http://localhost:8083";

/// Returns the broomva config directory: `~/.broomva/`.
pub fn config_dir() -> PathBuf {
    dirs::home_dir()
        .expect("cannot determine home directory")
        .join(".broomva")
}

/// Returns the full path to the config file.
pub fn config_path() -> PathBuf {
    config_dir().join(CONFIG_FILE)
}

/// Returns the full path to the PID file.
pub fn pid_path() -> PathBuf {
    config_dir().join(PID_FILE)
}

/// Returns the full path to the log file.
pub fn log_path() -> PathBuf {
    config_dir().join(LOG_FILE)
}
