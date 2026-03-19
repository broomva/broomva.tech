use std::fs::{self, OpenOptions};
use std::io::{BufRead, BufReader, Write};

use chrono::Utc;
use serde::Serialize;

use crate::config::constants;
use crate::error::BroomvaResult;

/// NDJSON log entry.
#[derive(Debug, Clone, serde::Deserialize, Serialize)]
pub struct LogEntry {
    pub timestamp: String,
    pub level: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sensor: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<serde_json::Value>,
}

/// NDJSON file logger for the daemon.
pub struct DaemonLogger {
    path: std::path::PathBuf,
}

impl DaemonLogger {
    pub fn new() -> Self {
        Self {
            path: constants::log_path(),
        }
    }

    pub fn log(
        &self,
        level: &str,
        message: &str,
        sensor: Option<&str>,
        details: Option<serde_json::Value>,
    ) {
        let entry = LogEntry {
            timestamp: Utc::now().to_rfc3339(),
            level: level.to_string(),
            message: message.to_string(),
            sensor: sensor.map(String::from),
            details,
        };

        if let Ok(line) = serde_json::to_string(&entry)
            && let Ok(mut file) = OpenOptions::new()
                .create(true)
                .append(true)
                .open(&self.path)
        {
            let _ = writeln!(file, "{line}");
        }
    }

    pub fn info(&self, message: &str) {
        self.log("info", message, None, None);
    }

    pub fn sensor_result(
        &self,
        sensor: &str,
        level: &str,
        message: &str,
        details: Option<serde_json::Value>,
    ) {
        self.log(level, message, Some(sensor), details);
    }
}

/// Read the last N lines from the daemon log, optionally filtering by level.
pub fn read_logs(lines: usize, level: Option<&str>) -> BroomvaResult<Vec<LogEntry>> {
    let path = constants::log_path();
    if !path.exists() {
        return Ok(vec![]);
    }

    let file = fs::File::open(&path)?;
    let reader = BufReader::new(file);
    let all_lines: Vec<String> = reader.lines().map_while(Result::ok).collect();

    let mut entries: Vec<LogEntry> = all_lines
        .iter()
        .filter_map(|line| serde_json::from_str::<LogEntry>(line).ok())
        .collect();

    if let Some(lvl) = level {
        entries.retain(|e| e.level.eq_ignore_ascii_case(lvl));
    }

    let start = entries.len().saturating_sub(lines);
    Ok(entries[start..].to_vec())
}
