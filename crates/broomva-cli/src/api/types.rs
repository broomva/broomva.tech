use serde::{Deserialize, Serialize};

// ── Prompts ──

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptSummary {
    pub id: String,
    pub slug: String,
    pub title: String,
    pub summary: Option<String>,
    pub category: Option<String>,
    pub model: Option<String>,
    pub visibility: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptDetail {
    pub id: String,
    pub slug: String,
    pub title: String,
    pub content: String,
    pub summary: Option<String>,
    pub category: Option<String>,
    pub model: Option<String>,
    pub version: Option<String>,
    pub tags: Option<Vec<String>>,
    pub visibility: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
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
        assert!(json.contains("\"prompt_slug\":\"code-review-agent\""), "got: {json}");
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
