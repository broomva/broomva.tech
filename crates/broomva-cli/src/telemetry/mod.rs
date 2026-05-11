//! Telemetry — fires invocation beacons, manages session IDs, detects
//! source attribution. Wired into the `prompts pull` happy path so every
//! pull produces a `PromptInvocation` row server-side.

pub mod beacon;
pub mod session;
pub mod source;
