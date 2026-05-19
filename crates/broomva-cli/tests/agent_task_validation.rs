//! Integration tests for Phase B's client-side task-spec validation.
//!
//! Spec deliverable §6 Phase B: "tests/agent_task_validation.rs —
//! fixture specs valid + invalid → expected verdicts."
//!
//! These tests exercise `broomva::cli::agent::validate_task_spec` at the
//! library boundary (rather than as unit tests inside the module) so we
//! catch any regression where the public surface drifts away from the
//! schema (`schemas/agent-task.v1.json`). The internal unit tests inside
//! `cli::agent::tests` cover the same validation paths but with embedded
//! `include_str!`-loaded fixtures; the integration suite below loads the
//! bundled `templates/*.task.yaml` files from disk to verify they stay
//! schema-conformant as the schema evolves.

use std::path::PathBuf;

use broomva::cli::agent::validate_task_spec;
use serde_json::json;

/// Crate-root path for resolving on-disk fixtures (`CARGO_MANIFEST_DIR`
/// is set during `cargo test`).
fn crate_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
}

/// Load a bundled template via the on-disk path (not `include_str!`), as
/// a user-installed copy at `~/.broomva/templates/` would.
fn load_template(name: &str) -> serde_json::Value {
    let path = crate_root().join("templates").join(name);
    let raw = std::fs::read_to_string(&path)
        .unwrap_or_else(|e| panic!("read template {}: {e}", path.display()));
    let yaml: serde_yaml::Value =
        serde_yaml::from_str(&raw).unwrap_or_else(|e| panic!("template {name} YAML: {e}"));
    serde_json::to_value(yaml).unwrap_or_else(|e| panic!("template {name} JSON projection: {e}"))
}

// ── Positive fixtures (templates ship valid) ──────────────────────────

#[test]
fn template_hello_validates() {
    validate_task_spec(&load_template("hello.task.yaml")).expect("hello template must validate");
}

#[test]
fn template_summarize_pr_validates() {
    validate_task_spec(&load_template("summarize-pr.task.yaml"))
        .expect("summarize-pr template must validate");
}

#[test]
fn template_update_linear_validates() {
    validate_task_spec(&load_template("update-linear.task.yaml"))
        .expect("update-linear template must validate");
}

#[test]
fn template_daily_briefing_validates() {
    validate_task_spec(&load_template("daily-briefing.task.yaml"))
        .expect("daily-briefing template must validate");
}

// ── Negative fixtures (5+ invalid variants per spec §6 Phase B) ───────

#[test]
fn rejects_missing_prompt() {
    let spec = json!({
        "name": "no-prompt",
        "input": {}
    });
    let err = validate_task_spec(&spec).expect_err("missing input.prompt must fail");
    assert!(
        err.to_string().to_lowercase().contains("prompt"),
        "error message should mention prompt; got: {err}"
    );
}

#[test]
fn rejects_unknown_top_level_key() {
    let spec = json!({
        "name": "unknown-field",
        "input": { "prompt": "hello" },
        "frobnicate": true
    });
    validate_task_spec(&spec).expect_err("unknown top-level keys must be rejected");
}

#[test]
fn rejects_empty_prompt() {
    let spec = json!({
        "name": "empty-prompt",
        "input": { "prompt": "" }
    });
    validate_task_spec(&spec).expect_err("empty prompt (minLength 1) must fail");
}

#[test]
fn rejects_negative_max_cost_usd() {
    let spec = json!({
        "name": "negative-cap",
        "input": { "prompt": "hi" },
        "agent": { "max_cost_usd": -0.01 }
    });
    validate_task_spec(&spec).expect_err("negative max_cost_usd must be rejected (minimum 0)");
}

#[test]
fn rejects_zero_timeout_seconds() {
    let spec = json!({
        "name": "zero-timeout",
        "input": { "prompt": "hi" },
        "agent": { "timeout_seconds": 0 }
    });
    validate_task_spec(&spec).expect_err("timeout_seconds = 0 must be rejected (minimum 1)");
}

#[test]
fn rejects_missing_name() {
    let spec = json!({
        "input": { "prompt": "hi" }
    });
    validate_task_spec(&spec).expect_err("missing required name field must fail");
}

#[test]
fn rejects_non_object_root() {
    let spec = json!("not an object");
    validate_task_spec(&spec).expect_err("non-object root must fail");
}
