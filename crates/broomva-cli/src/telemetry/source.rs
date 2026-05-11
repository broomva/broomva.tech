//! Source attribution helpers — determines whether the CLI run originated
//! from a terminal (`cli`), the Claude Code skill (`skill`), or an external
//! programmatic caller (`api`). Honors `BROOMVA_SOURCE` and
//! `BROOMVA_TELEMETRY_DISABLED` env vars.

pub const ENV_SOURCE: &str = "BROOMVA_SOURCE";
pub const ENV_TELEMETRY_DISABLED: &str = "BROOMVA_TELEMETRY_DISABLED";
pub const ENV_RAW_VARS: &str = "BROOMVA_TELEMETRY_RAW_VARS";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Source {
    Cli,
    Skill,
    Api,
}

impl Source {
    pub fn as_str(self) -> &'static str {
        match self {
            Source::Cli => "cli",
            Source::Skill => "skill",
            Source::Api => "api",
        }
    }
}

/// Resolve the source from the env var. Defaults to `Source::Cli` if the
/// var is unset or has an unrecognized value.
pub fn detect_source() -> Source {
    match std::env::var(ENV_SOURCE).ok().as_deref() {
        Some("skill") => Source::Skill,
        Some("api") => Source::Api,
        Some("cli") | None => Source::Cli,
        Some(_) => Source::Cli,
    }
}

/// `true` when `BROOMVA_TELEMETRY_DISABLED=1`. Any other value (including
/// unset, empty, or "0") returns `false`.
pub fn telemetry_disabled() -> bool {
    std::env::var(ENV_TELEMETRY_DISABLED).ok().as_deref() == Some("1")
}

/// `true` when `BROOMVA_TELEMETRY_RAW_VARS=1` (admin opt-in to send raw
/// variable values rather than hashed).
pub fn raw_vars_enabled() -> bool {
    std::env::var(ENV_RAW_VARS).ok().as_deref() == Some("1")
}

/// Caller string sent on every invocation. Format: `broomva-cli/<version>`.
pub fn caller_string() -> String {
    format!("broomva-cli/{}", env!("CARGO_PKG_VERSION"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    // serialize env mutation across tests to avoid flakes
    static ENV_LOCK: Mutex<()> = Mutex::new(());

    fn with_env<F: FnOnce()>(key: &str, value: Option<&str>, f: F) {
        let _guard = ENV_LOCK.lock().unwrap();
        let prev = std::env::var(key).ok();
        match value {
            Some(v) => unsafe { std::env::set_var(key, v) },
            None => unsafe { std::env::remove_var(key) },
        }
        f();
        match prev {
            Some(v) => unsafe { std::env::set_var(key, v) },
            None => unsafe { std::env::remove_var(key) },
        }
    }

    #[test]
    fn detect_source_defaults_to_cli() {
        with_env(ENV_SOURCE, None, || {
            assert_eq!(detect_source(), Source::Cli);
        });
    }

    #[test]
    fn detect_source_reads_skill() {
        with_env(ENV_SOURCE, Some("skill"), || {
            assert_eq!(detect_source(), Source::Skill);
        });
    }

    #[test]
    fn detect_source_reads_api() {
        with_env(ENV_SOURCE, Some("api"), || {
            assert_eq!(detect_source(), Source::Api);
        });
    }

    #[test]
    fn detect_source_unknown_value_falls_back_to_cli() {
        with_env(ENV_SOURCE, Some("zzz"), || {
            assert_eq!(detect_source(), Source::Cli);
        });
    }

    #[test]
    fn telemetry_disabled_only_when_one() {
        with_env(ENV_TELEMETRY_DISABLED, Some("1"), || {
            assert!(telemetry_disabled());
        });
        with_env(ENV_TELEMETRY_DISABLED, Some("0"), || {
            assert!(!telemetry_disabled());
        });
        with_env(ENV_TELEMETRY_DISABLED, None, || {
            assert!(!telemetry_disabled());
        });
    }

    #[test]
    fn caller_string_has_expected_prefix() {
        assert!(caller_string().starts_with("broomva-cli/"));
    }
}
