//! `broomva` library surface — re-exports the modules used by the
//! `broomva` binary so integration tests (e.g. `tests/chat_smoke.rs`)
//! can drive the same code path the CLI runs in production.
//!
//! The binary `src/main.rs` keeps its own `mod` declarations; this
//! file mirrors them as `pub mod` so they're accessible to
//! `#[cfg(test)]` and `tests/*.rs` files.
//!
//! Keep the surface narrow — only the items integration tests need
//! should be exposed.

pub mod api;
pub mod cli;
pub mod config;
pub mod daemon;
pub mod error;
pub mod frontmatter;
pub mod telemetry;
pub mod tui;
