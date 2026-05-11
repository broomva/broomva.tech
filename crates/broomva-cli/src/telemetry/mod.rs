//! Telemetry — fires invocation beacons, manages session IDs, detects
//! source attribution. Wired into the `prompts pull` happy path so every
//! pull produces a `PromptInvocation` row server-side.

pub mod beacon;
pub mod session;
pub mod source;

/// Process-shared lock for tests that mutate `BROOMVA_*` env vars. Tests
/// in different modules can race when env vars are mutated; serializing
/// via this lock keeps `cargo test` (parallel by default) reliable.
#[cfg(test)]
pub(crate) static TELEMETRY_ENV_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
