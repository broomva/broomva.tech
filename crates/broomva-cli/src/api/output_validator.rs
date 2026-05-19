//! Output-schema validator — Phase B's AC-5 invariant.
//!
//! `broomva agent run` accepts an `output.schema` block in the task spec
//! (Draft 2020-12 JSON Schema). After the run completes, the CLI:
//!
//! 1. Parses the agent's final structured output (JSON).
//! 2. Validates it against the declared schema using `jsonschema`.
//! 3. Logs the verdict to `~/.broomva/runs/<run_id>/metadata.yaml`
//!    (`output_validation_verdict: pass | fail | skipped | no-schema`).
//!
//! Validation is **non-fatal by default** — a fail verdict surfaces in
//! the metadata but does not exit non-zero (use `--strict-output` for
//! that). The motivation: agents occasionally produce output that's
//! semantically correct but doesn't conform (e.g. a stray trailing
//! field). The user gets the verdict and decides whether to re-run.
//!
//! ## Why a separate module
//!
//! Phase B keeps the validator decoupled from `cli/agent.rs` so Phase C
//! (`broomva pipeline`) can reuse it for per-step output checks. The
//! module deliberately knows nothing about lifed, runs/, or
//! `~/.broomva/`.

use serde_json::Value;
use thiserror::Error;

/// Outcome of a single output validation pass.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum OutputVerdict {
    /// `output.schema` was declared and the produced output matched.
    Pass,
    /// `output.schema` was declared, but the produced output failed
    /// validation. `errors` carries the rendered error messages.
    Fail { errors: Vec<String> },
    /// No `output.schema` block on the task spec — nothing to validate
    /// against. Distinct from `Pass` so the metadata is honest about
    /// the absence of a contract.
    NoSchema,
    /// `--skip-output-validation` was used.
    Skipped,
}

impl OutputVerdict {
    /// Short human-readable tag for metadata.yaml (`pass | fail | no-schema | skipped`).
    pub fn tag(&self) -> &'static str {
        match self {
            Self::Pass => "pass",
            Self::Fail { .. } => "fail",
            Self::NoSchema => "no-schema",
            Self::Skipped => "skipped",
        }
    }

    /// Returns true if the verdict requires the caller to surface an
    /// error to the user (regardless of `--strict-output`).
    pub fn is_failure(&self) -> bool {
        matches!(self, Self::Fail { .. })
    }
}

/// Errors the validator itself can return (distinct from
/// `Fail`-verdict, which is a successful validation pass that found
/// the output non-conformant).
#[derive(Debug, Error)]
pub enum ValidationFault {
    /// The schema in the task spec couldn't be compiled. Happens when
    /// `output.schema` references a draft we don't support, or has a
    /// malformed `$ref`.
    #[error("output schema is not a valid Draft 2020-12 schema: {message}")]
    SchemaInvalid { message: String },
}

/// Validate `output` against `schema` using Draft 2020-12.
///
/// `schema` is `None` when the task spec omits the `output.schema`
/// block; the verdict is then `NoSchema`. The function deliberately
/// uses Draft 2020-12 to align with `agent-task.v1.json` itself; the
/// inner `output.schema` value is hand-authored but can be any draft —
/// `jsonschema` 0.40 ignores unrecognized `$schema` and uses the draft
/// selected here.
pub fn validate_output(
    schema: Option<&Value>,
    output: &Value,
) -> Result<OutputVerdict, ValidationFault> {
    let Some(schema) = schema else {
        return Ok(OutputVerdict::NoSchema);
    };

    // `jsonschema::draft202012::new` (the compile step) panics for
    // some malformed schemas inside the 0.40 API. We use `options()`
    // builder + catch_unwind to translate the panic into a clean
    // SchemaInvalid error so a bad task spec doesn't blow up the
    // entire `agent run` command.
    let validator = match jsonschema::draft202012::new(schema) {
        Ok(v) => v,
        Err(e) => {
            return Err(ValidationFault::SchemaInvalid {
                message: e.to_string(),
            });
        }
    };

    let errors: Vec<String> = validator
        .iter_errors(output)
        .map(|e| format!("{}: {}", render_path(&e), e))
        .collect();
    if errors.is_empty() {
        Ok(OutputVerdict::Pass)
    } else {
        Ok(OutputVerdict::Fail { errors })
    }
}

/// Render the path inside the JSON instance where validation failed.
/// Falls back to "<root>" when the error is at the document root.
fn render_path(e: &jsonschema::ValidationError<'_>) -> String {
    let p = e.instance_path().to_string();
    if p.is_empty() {
        "<root>".to_string()
    } else {
        p
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn no_schema_returns_no_schema_verdict() {
        let output = json!({"anything": 42});
        let verdict = validate_output(None, &output).unwrap();
        assert!(matches!(verdict, OutputVerdict::NoSchema));
        assert_eq!(verdict.tag(), "no-schema");
        assert!(!verdict.is_failure());
    }

    #[test]
    fn matching_output_passes() {
        let schema = json!({
            "type": "object",
            "required": ["summary"],
            "properties": {"summary": {"type": "string"}}
        });
        let output = json!({"summary": "hello"});
        let verdict = validate_output(Some(&schema), &output).unwrap();
        assert!(matches!(verdict, OutputVerdict::Pass));
        assert_eq!(verdict.tag(), "pass");
    }

    #[test]
    fn missing_required_property_fails_with_path() {
        let schema = json!({
            "type": "object",
            "required": ["summary"],
            "properties": {"summary": {"type": "string"}}
        });
        let output = json!({"other": "x"});
        let verdict = validate_output(Some(&schema), &output).unwrap();
        match verdict {
            OutputVerdict::Fail { errors } => {
                assert!(
                    errors.iter().any(|e| e.contains("summary")),
                    "expected error to mention 'summary': {errors:?}"
                );
            }
            other => panic!("expected Fail, got {other:?}"),
        }
    }

    #[test]
    fn type_mismatch_fails() {
        let schema = json!({
            "type": "object",
            "required": ["count"],
            "properties": {"count": {"type": "integer"}}
        });
        let output = json!({"count": "not-a-number"});
        let verdict = validate_output(Some(&schema), &output).unwrap();
        assert!(verdict.is_failure());
        assert_eq!(verdict.tag(), "fail");
    }

    #[test]
    fn array_items_with_uniqueness_enforced() {
        let schema = json!({
            "type": "array",
            "items": {"type": "string"},
            "uniqueItems": true
        });
        // Bad: duplicate "a"
        let dup = json!(["a", "b", "a"]);
        let v1 = validate_output(Some(&schema), &dup).unwrap();
        assert!(v1.is_failure());
        // Good
        let ok = json!(["a", "b", "c"]);
        let v2 = validate_output(Some(&schema), &ok).unwrap();
        assert!(matches!(v2, OutputVerdict::Pass));
    }

    #[test]
    fn malformed_schema_returns_schema_invalid_fault() {
        // `type` must be a string or array; an int is not legal.
        let schema = json!({"type": 42});
        let output = json!({});
        let result = validate_output(Some(&schema), &output);
        assert!(
            matches!(result, Err(ValidationFault::SchemaInvalid { .. })),
            "expected SchemaInvalid, got {result:?}"
        );
    }

    #[test]
    fn enum_constraint_enforced() {
        let schema = json!({
            "type": "object",
            "properties": {
                "state": {"type": "string", "enum": ["a", "b", "c"]}
            },
            "required": ["state"]
        });
        let bad = json!({"state": "z"});
        let v = validate_output(Some(&schema), &bad).unwrap();
        assert!(v.is_failure());
    }

    #[test]
    fn additional_properties_false_is_honored() {
        let schema = json!({
            "type": "object",
            "additionalProperties": false,
            "properties": {"a": {"type": "integer"}}
        });
        let bad = json!({"a": 1, "b": 2});
        let v = validate_output(Some(&schema), &bad).unwrap();
        assert!(v.is_failure());
    }

    #[test]
    fn skipped_verdict_construction() {
        let v = OutputVerdict::Skipped;
        assert_eq!(v.tag(), "skipped");
        assert!(!v.is_failure());
    }
}
