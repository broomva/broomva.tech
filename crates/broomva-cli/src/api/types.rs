use serde::{Deserialize, Serialize};

// ── Prompts ──

/// PromptSummary matches the shape emitted by `GET /api/prompts`
/// (`apps/chat/app/api/prompts/route.ts`). Server uses the slug as the
/// stable identifier and omits `id` from the response — match accordingly.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptSummary {
    #[serde(default)]
    pub id: Option<String>,
    pub slug: String,
    pub title: String,
    pub summary: Option<String>,
    pub category: Option<String>,
    pub model: Option<String>,
    #[serde(default)]
    pub visibility: Option<String>,
    /// Server emits this as `date` (mirrors updatedAt). camelCase fallback
    /// accepted so we tolerate either source without churn.
    #[serde(default, alias = "date")]
    pub created_at: Option<String>,
    #[serde(default)]
    pub updated_at: Option<String>,
}

/// Returned by `BroomvaClient::create_prompt` and `update_prompt`. Carries
/// the deserialized `PromptDetail` alongside the operator-facing GitHub-mirror
/// signal (BRO-1183). A named struct keeps the API extensible — future
/// out-of-band signals (e.g. CDN purge status) become new fields rather than
/// another breaking tuple expansion. `prompt` derefs through field access so
/// existing callers that only care about the body can ignore the rest.
#[derive(Debug, Clone)]
pub struct PromptPushResponse {
    pub prompt: PromptDetail,
    /// Raw `Warning` header verbatim when the server sent one. The CLI
    /// surfaces this only when the body field is absent (older servers).
    pub warning_header: Option<String>,
}

/// GithubMirrorStatus is the operator-facing signal emitted by the server
/// on admin POST `/api/prompts` and PUT `/api/prompts/[slug]` (BRO-1181).
/// Emitted as `{"ok": true}` on success or `{"ok": false, "error": "..."}`
/// when the GitHub mirror failed. Older servers omit the field entirely;
/// the consumer treats `None` as "no signal available" rather than success.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GithubMirrorStatus {
    pub ok: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// PromptDetail matches `GET /api/prompts/[slug]`
/// (`apps/chat/app/api/prompts/[slug]/route.ts`). Same caveat as
/// PromptSummary: `id` is omitted server-side.
///
/// `github_mirror` is populated only on admin POST `/api/prompts` and
/// PUT `/api/prompts/[slug]` responses (BRO-1181). It is `None` on GETs
/// and against older servers — both shapes deserialize cleanly because
/// `PromptDetail` does not set `deny_unknown_fields`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptDetail {
    #[serde(default)]
    pub id: Option<String>,
    pub slug: String,
    pub title: String,
    pub content: String,
    pub summary: Option<String>,
    pub category: Option<String>,
    pub model: Option<String>,
    pub version: Option<String>,
    pub tags: Option<Vec<String>>,
    pub visibility: Option<String>,
    #[serde(default, alias = "date")]
    pub created_at: Option<String>,
    #[serde(default)]
    pub updated_at: Option<String>,
    /// Set by admin POST/PUT responses when the server attempted a GitHub
    /// mirror. `Some({ok: true})` = mirror succeeded, `Some({ok: false,
    /// error})` = mirror failed (DB row was still written), `None` = no
    /// mirror attempt or older server.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub github_mirror: Option<GithubMirrorStatus>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePromptRequest {
    pub title: String,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub category: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub variables: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub links: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub visibility: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdatePromptRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub category: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub variables: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub links: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub visibility: Option<String>,
}

// ── Invocations (Phase 2 telemetry) ──
// Some structs below are consumed only by tests in Batch A; CLI wiring in
// subsequent batches will exercise them. Suppress dead-code until then.

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct InvocationCreateRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    pub prompt_slug: String,
    pub prompt_version: String,
    pub source: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub caller: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub variables: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<serde_json::Value>,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct InvocationCreateResponse {
    pub id: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct InvocationUpdateRequest {
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latency_ms: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tokens_in: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tokens_out: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct InvocationRow {
    pub id: String,
    pub prompt_slug: String,
    pub prompt_version: String,
    pub source: String,
    pub caller: Option<String>,
    pub user_id: Option<String>,
    pub agent_id: Option<String>,
    pub session_id: Option<String>,
    pub client_ip_hash: Option<String>,
    pub variables: Option<serde_json::Value>,
    pub status: String,
    pub model: Option<String>,
    pub latency_ms: Option<i64>,
    pub tokens_in: Option<i64>,
    pub tokens_out: Option<i64>,
    pub cost_usd: Option<f64>,
    pub error_message: Option<String>,
    pub external_trace_id: Option<String>,
    pub external_span_id: Option<String>,
    pub metadata: Option<serde_json::Value>,
    pub created_at: String,
    pub completed_at: Option<String>,
}

// ── Feedback (Phase 2 telemetry) ──

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct FeedbackCreateRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub invocation_id: Option<String>,
    pub prompt_slug: String,
    pub prompt_version: String,
    pub signal: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct FeedbackCreateResponse {
    pub id: String,
    pub created_at: String,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct FeedbackRow {
    pub id: String,
    pub invocation_id: Option<String>,
    pub prompt_slug: String,
    pub prompt_version: String,
    pub user_id: Option<String>,
    pub signal: String,
    pub text: Option<String>,
    pub source: String,
    pub created_at: String,
}

// ── Metrics responses (Phase 2 telemetry) ──

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct MetricsTotals {
    pub prompts: i64,
    pub copies: i64,
    pub cli_pulls: i64,
    pub skill_invokes: i64,
    pub traces: i64,
    pub runs_7d: i64,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct MetricsDeltas {
    pub copies: f64,
    pub cli_pulls: f64,
    pub skill_invokes: f64,
    pub traces: f64,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct MetricsOverview {
    pub since: String,
    pub as_of: String,
    pub last_invocation_at: Option<String>,
    pub totals: MetricsTotals,
    pub deltas_vs_prev: MetricsDeltas,
    pub live_failures_1h: i64,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct VolumeBucketRow {
    pub ts: String,
    pub count: i64,
    pub by_source: serde_json::Value,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct PromptMetricTotals {
    pub copies: i64,
    pub cli_pulls: i64,
    pub skill_invokes: i64,
    pub traces: i64,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct PromptFeedbackSummary {
    pub thumbs_up: i64,
    pub thumbs_down: i64,
    pub rate: Option<f64>,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct PromptMetrics {
    pub totals: PromptMetricTotals,
    pub runs_7d: i64,
    pub delta_pct: f64,
    pub last_used_at: Option<String>,
    pub avg_latency_ms: Option<i64>,
    pub avg_cost_usd: Option<f64>,
    pub feedback: PromptFeedbackSummary,
}

// ── Skills ──

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillSummary {
    pub id: String,
    pub slug: String,
    pub name: String,
    pub layer: Option<String>,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillDetail {
    pub id: String,
    pub slug: String,
    pub name: String,
    pub layer: Option<String>,
    pub description: Option<String>,
    pub content: Option<String>,
    pub install_command: Option<String>,
}

// ── Context ──

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextInfo {
    pub conventions: Option<serde_json::Value>,
    pub stack: Option<serde_json::Value>,
    #[serde(flatten)]
    pub extra: serde_json::Map<String, serde_json::Value>,
}

// ── Auth ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceCodeResponse {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    #[serde(default)]
    pub verification_uri_complete: Option<String>,
    #[serde(default = "default_interval")]
    pub interval: u64,
    pub expires_in: Option<u64>,
}

fn default_interval() -> u64 {
    5
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceTokenRequest {
    pub device_code: String,
    pub grant_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenResponse {
    pub access_token: String,
    #[serde(default)]
    pub token_type: Option<String>,
    #[serde(default)]
    pub expires_in: Option<u64>,
    #[serde(default)]
    pub expires_at: Option<String>,
    #[serde(default)]
    pub refresh_token: Option<String>,
    /// Agent info (present when registering as agent)
    #[serde(default)]
    pub agent: Option<serde_json::Value>,
    /// BRO-1203 — ES256 Tier-1 JWT for production lifegw. The Better
    /// Auth `access_token` above is HS256 and is rejected by
    /// `life.broomva.tech` with `missing kid in JWT header`. Servers
    /// before v0.8.1 omit this field entirely → deserializes to None.
    #[serde(default)]
    pub lifegw_token: Option<String>,
    /// Epoch seconds when `lifegw_token` expires. Spec C₃ §5.4 caps
    /// Tier-1 capability tokens at 15 minutes.
    #[serde(default)]
    pub lifegw_token_expires_at: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceTokenError {
    pub error: String,
    #[serde(default)]
    pub error_description: Option<String>,
}

// ── Console ──

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceHealth {
    pub status: String,
    pub latency_ms: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConsoleHealth {
    pub arcan: ServiceHealth,
    pub lago: ServiceHealth,
    pub autonomic: ServiceHealth,
    pub haima: ServiceHealth,
    pub timestamp: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSession {
    pub id: String,
    pub status: Option<String>,
    pub agent: Option<String>,
    pub started_at: Option<String>,
    pub ended_at: Option<String>,
}

// ── API Wrapper ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiResponse<T> {
    pub data: Option<T>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiListResponse<T> {
    pub data: Option<Vec<T>>,
    pub error: Option<String>,
}

// ── Docs (BRO-1293) ──
//
// `broomva docs publish <file.html>` uploads an agent-authored HTML document
// (spec/PRD/architecture/report) and returns a stable, owner-gated URL of the
// form `<base>/d/<id>`. Owner is the authenticated identity behind the Bearer
// token — nothing hardcoded server-side.

/// Git provenance for an archived document (where the source file lives in VCS).
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocSource {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub repo: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub commit: Option<String>,
}

impl DocSource {
    pub fn is_empty(&self) -> bool {
        self.repo.is_none() && self.path.is_none() && self.commit.is_none()
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublishDocRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    /// Stable handle; re-publishing the same handle appends a version.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub handle: Option<String>,
    /// Publish as a work-in-progress draft.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub draft: Option<bool>,
    pub html: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<DocSource>,
}

/// Back-compat defaults: a pre-lifecycle server omits these fields; a doc with
/// no explicit lifecycle is version 1, published (not 0 / empty-string).
fn default_doc_version() -> i64 {
    1
}
fn default_doc_state() -> String {
    "published".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PublishDocResponse {
    pub id: String,
    #[serde(default)]
    pub handle: Option<String>,
    #[serde(default = "default_doc_version")]
    pub version: i64,
    #[serde(default = "default_doc_state")]
    pub state: String,
    #[serde(default)]
    pub title: String,
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocSummary {
    pub id: String,
    #[serde(default)]
    pub handle: Option<String>,
    #[serde(default)]
    pub version: Option<i64>,
    #[serde(default)]
    pub state: Option<String>,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub url: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_path: Option<String>,
    #[serde(default)]
    pub created_at: String,
}

#[cfg(test)]
mod telemetry_types_tests {
    use super::*;

    #[test]
    fn invocation_create_serializes_snake_case() {
        let req = InvocationCreateRequest {
            id: Some("9f8e7d6c-1111-4222-8333-444444444444".into()),
            prompt_slug: "code-review-agent".into(),
            prompt_version: "1.0".into(),
            source: "cli".into(),
            caller: Some("broomva-cli/0.3.0".into()),
            session_id: Some("11111111-2222-4333-8444-555555555555".into()),
            variables: None,
            metadata: None,
        };
        let json = serde_json::to_string(&req).unwrap();
        assert!(
            json.contains("\"prompt_slug\":\"code-review-agent\""),
            "got: {json}"
        );
        assert!(json.contains("\"prompt_version\":\"1.0\""), "got: {json}");
        assert!(json.contains("\"session_id\""), "got: {json}");
    }

    #[test]
    fn invocation_create_response_deserializes_snake_case() {
        let body = r#"{"id":"abc-123","created_at":"2026-05-11T00:00:00Z"}"#;
        let resp: InvocationCreateResponse = serde_json::from_str(body).unwrap();
        assert_eq!(resp.id, "abc-123");
        assert_eq!(resp.created_at, "2026-05-11T00:00:00Z");
    }

    #[test]
    fn invocation_row_deserializes_full_shape() {
        let body = r#"{
            "id":"abc-123",
            "prompt_slug":"x",
            "prompt_version":"1.0",
            "source":"cli",
            "caller":null,
            "user_id":null,
            "agent_id":null,
            "session_id":null,
            "client_ip_hash":null,
            "variables":null,
            "status":"completed",
            "model":"claude-sonnet-4.5",
            "latency_ms":11200,
            "tokens_in":1000,
            "tokens_out":500,
            "cost_usd":0.0105,
            "error_message":null,
            "external_trace_id":null,
            "external_span_id":null,
            "metadata":null,
            "created_at":"2026-05-11T00:00:00Z",
            "completed_at":"2026-05-11T00:00:01Z"
        }"#;
        let row: InvocationRow = serde_json::from_str(body).unwrap();
        assert_eq!(row.status, "completed");
        assert_eq!(row.model.as_deref(), Some("claude-sonnet-4.5"));
        assert_eq!(row.latency_ms, Some(11200));
        assert!((row.cost_usd.unwrap() - 0.0105).abs() < 1e-9);
    }

    #[test]
    fn feedback_create_request_serializes() {
        let req = FeedbackCreateRequest {
            invocation_id: Some("abc".into()),
            prompt_slug: "x".into(),
            prompt_version: "1.0".into(),
            signal: "thumbs_up".into(),
            text: Some("nice".into()),
            source: "cli".into(),
        };
        let json = serde_json::to_string(&req).unwrap();
        assert!(json.contains("\"invocation_id\":\"abc\""));
        assert!(json.contains("\"signal\":\"thumbs_up\""));
    }

    #[test]
    fn prompt_detail_deserializes_mirror_ok() {
        // BRO-1183: admin POST/PUT response with successful mirror.
        let body = r#"{
            "slug":"x",
            "title":"t",
            "content":"c",
            "githubMirror":{"ok":true}
        }"#;
        let p: PromptDetail = serde_json::from_str(body).unwrap();
        assert_eq!(
            p.github_mirror,
            Some(GithubMirrorStatus {
                ok: true,
                error: None
            })
        );
    }

    #[test]
    fn prompt_detail_deserializes_mirror_failure() {
        // BRO-1183: admin POST/PUT response with failed mirror — DB write
        // preserved but the GitHub mirror error is surfaced to the caller.
        let body = r#"{
            "slug":"x",
            "title":"t",
            "content":"c",
            "githubMirror":{"ok":false,"error":"GITHUB_TOKEN not set"}
        }"#;
        let p: PromptDetail = serde_json::from_str(body).unwrap();
        assert_eq!(
            p.github_mirror,
            Some(GithubMirrorStatus {
                ok: false,
                error: Some("GITHUB_TOKEN not set".into())
            })
        );
    }

    #[test]
    fn prompt_detail_deserializes_without_mirror_field() {
        // BRO-1183: GET response or older server — back-compat path.
        let body = r#"{
            "slug":"x",
            "title":"t",
            "content":"c"
        }"#;
        let p: PromptDetail = serde_json::from_str(body).unwrap();
        assert!(p.github_mirror.is_none());
    }

    #[test]
    fn metrics_overview_deserializes() {
        let body = r#"{
            "since":"7d",
            "as_of":"2026-05-11T00:00:00Z",
            "last_invocation_at":"2026-05-11T00:00:00Z",
            "totals":{"prompts":29,"copies":100,"cli_pulls":50,"skill_invokes":200,"traces":350,"runs_7d":350},
            "deltas_vs_prev":{"copies":0.1,"cli_pulls":0.2,"skill_invokes":0.3,"traces":0.2},
            "live_failures_1h":3
        }"#;
        let m: MetricsOverview = serde_json::from_str(body).unwrap();
        assert_eq!(m.totals.prompts, 29);
        assert_eq!(m.totals.skill_invokes, 200);
        assert_eq!(m.live_failures_1h, 3);
    }
}
