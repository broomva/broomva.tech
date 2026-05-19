//! Client for the lifed daemon — Spec D's 4-step `Agent.CreateSession`
//! saga + Spec C₃ `StreamSession` events.
//!
//! ## Wire shape (Phase B — interface)
//!
//! The spec at `docs/specs/2026-05-18-broomva-cli-agent-chat-pipeline.md` §6
//! Phase B reserves the right to ship this surface as either:
//!
//!   1. A `tonic` gRPC client driving the canonical proto from
//!      `~/broomva/core/life/crates/lifed/proto/`, OR
//!   2. An HTTP/JSON shim talking to a `tonic-web` (or hand-rolled)
//!      reverse-proxy in front of the same gRPC server.
//!
//! Phase B ships **option 2** — HTTP/JSON over `reqwest` to four
//! hypothetical endpoints under `<lifed_base>/v1/lifed/...`. Reasons:
//!
//!   * The lifed gateway used by `broomva agent` against a deployed
//!     stack is not reachable in broomva.tech CI today (the runtime
//!     contract lives in `broomva/life`, a sibling repo). Pulling
//!     `tonic` + `prost` + `tonic-build` adds ~120-180 MB to the build
//!     and a non-trivial build-script dep just to compile dead code.
//!   * The trait + HTTP shim shape ships the **client-side
//!     architectural contract** (run lifecycle, frame shape, cancel
//!     semantics) without committing to a transport. Phase B.1 swaps
//!     the inner `LifedHttpClient` body for tonic once the lifegw is
//!     reachable in CI; the trait signature is stable.
//!   * `wiremock` (already a dev-dep) handles HTTP/JSON natively but
//!     does NOT carry WebSocket or gRPC primitives. Phase B's tests
//!     run against the HTTP shim end-to-end without skipping the
//!     transport layer.
//!
//! ## Trait shape
//!
//! [`LifedClient`] is the single seam between `cli/agent.rs` and the
//! substrate. Real production wiring (HTTPS to lifed via tonic-web)
//! and the in-memory test fake (`FakeLifedClient` in
//! `tests/agent_task_validation.rs`) implement the same trait, so the
//! CLI handler is transport-agnostic.

use serde::{Deserialize, Serialize};
use std::time::Duration;

use crate::error::{BroomvaError, BroomvaResult};

// ── Wire shape ──────────────────────────────────────────────────────

/// Per-run identifier — the ULID lifed assigns on `Agent.CreateSession`.
pub type RunId = String;

/// The task definition handed to `Agent.CreateSession`. Mirrors the
/// fields from `schemas/agent-task.v1.json` after validation but
/// before any client-side enrichment (no run_id yet).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentTaskSpec {
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub input: AgentInput,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub agent: Option<AgentConfig>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub output: Option<AgentOutput>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentInput {
    pub prompt: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub variables: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AgentConfig {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub backend: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tools: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_cost_usd: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub timeout_seconds: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub on_timeout: Option<OnTimeout>,
}

/// Behaviour when `timeout_seconds` is exceeded. Matches the
/// `agent.on_timeout` enum in `agent-task.v1.json`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum OnTimeout {
    Fail,
    PartialOutput,
    Retry,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentOutput {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub schema: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub save_to: Option<String>,
}

/// Reply from `Agent.CreateSession`. lifed assigns `run_id` (ULID),
/// optional `session_id` (ULID), and the queued `status` (`queued` for
/// fresh saga, `running` if execution started before reply).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateSessionResponse {
    pub run_id: RunId,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
    pub status: RunStatus,
}

/// State machine vertices used by both lifed and the CLI listing /
/// tail commands. Mirrors the lifed saga states.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RunStatus {
    Queued,
    Running,
    Completed,
    Failed,
    Cancelled,
}

impl RunStatus {
    pub fn is_terminal(self) -> bool {
        matches!(self, Self::Completed | Self::Failed | Self::Cancelled)
    }

    pub fn label(self) -> &'static str {
        match self {
            Self::Queued => "queued",
            Self::Running => "running",
            Self::Completed => "completed",
            Self::Failed => "failed",
            Self::Cancelled => "cancelled",
        }
    }
}

/// Single event emitted by `lifed.StreamSession`. Shape mirrors the
/// proto's `oneof event` but flattened to a tagged enum so JSON serde
/// stays straightforward.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum RunEvent {
    /// Saga transitioned state (queued → running, running → completed, etc).
    StatusChanged {
        status: RunStatus,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        message: Option<String>,
    },
    /// Agent called a tool.
    ToolCall {
        name: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        args: Option<serde_json::Value>,
    },
    /// Tool returned a result (success or failure encoded inside the value).
    ToolResult {
        name: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        result: Option<serde_json::Value>,
    },
    /// Free-form reasoning the model emitted between tool calls.
    Reasoning { text: String },
    /// Model output token (when the agent streams a final answer).
    Output { text: String },
    /// Wallet ledger entry for cost tracking.
    Cost {
        usd: f64,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        component: Option<String>,
    },
    /// Terminal event — the saga finished and lifed will not emit more
    /// events. Carries the final structured output if the model
    /// produced one.
    Done {
        status: RunStatus,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        output: Option<serde_json::Value>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        cost_usd: Option<f64>,
    },
}

/// Summary row returned by `Agent.ListSessions`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunSummary {
    pub run_id: RunId,
    pub name: String,
    pub status: RunStatus,
    pub created_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub completed_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cost_usd: Option<f64>,
}

/// Detailed row returned by `Agent.GetSession`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunDetail {
    pub run_id: RunId,
    pub name: String,
    pub status: RunStatus,
    pub created_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub completed_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cost_usd: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub output: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

// ── LifedClient trait ───────────────────────────────────────────────

/// Boxed stream of [`RunEvent`] used by `tail`. Returns `Ok(None)`
/// on graceful exhaustion (lifed sent its terminal `Done`).
pub type RunEventStream = Box<dyn RunEventReader + Send>;

#[async_trait::async_trait]
pub trait RunEventReader {
    async fn next(&mut self) -> BroomvaResult<Option<RunEvent>>;
}

/// Single seam between `cli/agent.rs` and the lifed substrate.
/// Production code uses [`LifedHttpClient`]; tests swap a fake.
#[async_trait::async_trait]
pub trait LifedClient: Send + Sync {
    /// Spec D's 4-step saga (CreateAgent → OpenLagoNamespace →
    /// BindWallet → RegisterAnimaSession). Returns the assigned
    /// `run_id` once the saga is queued.
    async fn create_session(&self, spec: &AgentTaskSpec) -> BroomvaResult<CreateSessionResponse>;

    /// Stream lifecycle events for an in-flight run. Caller polls
    /// `next` until `Ok(None)` or a terminal `RunEvent::Done`.
    /// `from_sequence` lets the caller resume after a transport blip
    /// (Phase B.1; today this is a no-op for the HTTP shim).
    async fn stream_session(
        &self,
        run_id: &RunId,
        from_sequence: Option<u64>,
    ) -> BroomvaResult<RunEventStream>;

    /// Cancel a run. Returns the new status (typically `Cancelled` if
    /// the run was still in-flight, or the existing terminal status
    /// when the call lost the race).
    async fn cancel_session(&self, run_id: &RunId) -> BroomvaResult<RunStatus>;

    /// Look up a single run by id.
    async fn get_session(&self, run_id: &RunId) -> BroomvaResult<RunDetail>;

    /// List recent runs, newest first. `status` filters when set.
    /// `limit` defaults server-side (typically 50).
    async fn list_sessions(
        &self,
        status: Option<RunStatus>,
        limit: Option<u32>,
    ) -> BroomvaResult<Vec<RunSummary>>;
}

// ── Production impl — HTTP/JSON shim ────────────────────────────────

/// `LifedClient` backed by `reqwest`. Talks to a hypothetical lifed
/// HTTP/JSON proxy mounted under `<lifed_base>/v1/lifed/...`. Phase B
/// ships this with the explicit caveat (CHANGELOG + module docs above)
/// that the underlying gRPC wire isn't actually reachable until Phase B.1.
pub struct LifedHttpClient {
    base_url: String,
    token: Option<String>,
    http: reqwest::Client,
}

impl LifedHttpClient {
    /// Build the client. `base_url` is typically read from
    /// `~/.broomva/config.json` `lifedBaseUrl` or `BROOMVA_LIFED_URL`.
    pub fn new(base_url: String, token: Option<String>) -> Self {
        Self {
            base_url,
            token,
            http: reqwest::Client::builder()
                .timeout(Duration::from_secs(30))
                .connect_timeout(Duration::from_secs(10))
                .build()
                .expect("reqwest client builder"),
        }
    }

    fn url(&self, path: &str) -> String {
        format!(
            "{base}{sep}{path}",
            base = self.base_url.trim_end_matches('/'),
            sep = if path.starts_with('/') { "" } else { "/" }
        )
    }

    fn req(&self, method: reqwest::Method, path: &str) -> reqwest::RequestBuilder {
        let mut b = self.http.request(method, self.url(path));
        if let Some(tok) = &self.token {
            b = b.header("Authorization", format!("Bearer {tok}"));
        }
        b
    }

    async fn check(&self, resp: reqwest::Response) -> BroomvaResult<reqwest::Response> {
        let status = resp.status();
        if status.as_u16() == 401 {
            return Err(BroomvaError::AuthRequired);
        }
        if !status.is_success() {
            let code = status.as_u16();
            let body = resp.text().await.unwrap_or_default();
            return Err(BroomvaError::Api {
                status: code,
                message: format!("lifed HTTP {code}"),
                body: Some(body),
            });
        }
        Ok(resp)
    }
}

#[async_trait::async_trait]
impl LifedClient for LifedHttpClient {
    async fn create_session(&self, spec: &AgentTaskSpec) -> BroomvaResult<CreateSessionResponse> {
        let resp = self
            .req(reqwest::Method::POST, "/v1/lifed/agent/create-session")
            .json(spec)
            .send()
            .await?;
        let resp = self.check(resp).await?;
        Ok(resp.json().await?)
    }

    async fn stream_session(
        &self,
        run_id: &RunId,
        from_sequence: Option<u64>,
    ) -> BroomvaResult<RunEventStream> {
        let mut path = format!("/v1/lifed/agent/{run_id}/stream");
        if let Some(seq) = from_sequence {
            path.push_str(&format!("?from_sequence={seq}"));
        }
        // NDJSON-over-HTTP shim — each line is one RunEvent. Real
        // implementation will switch to a streaming gRPC response in
        // Phase B.1; the trait shape stays identical.
        let resp = self.req(reqwest::Method::GET, &path).send().await?;
        let resp = self.check(resp).await?;
        let bytes = resp.bytes().await?;
        let buffered = parse_ndjson_events(&bytes)?;
        Ok(Box::new(BufferedEventStream::new(buffered)))
    }

    async fn cancel_session(&self, run_id: &RunId) -> BroomvaResult<RunStatus> {
        let resp = self
            .req(
                reqwest::Method::POST,
                &format!("/v1/lifed/agent/{run_id}/cancel"),
            )
            .send()
            .await?;
        let resp = self.check(resp).await?;
        let body: serde_json::Value = resp.json().await?;
        // Accept either { "status": "cancelled" } or { "run_id": .., "status": .. }
        body.get("status")
            .and_then(|v| serde_json::from_value::<RunStatus>(v.clone()).ok())
            .ok_or_else(|| BroomvaError::User("cancel response missing `status`".into()))
    }

    async fn get_session(&self, run_id: &RunId) -> BroomvaResult<RunDetail> {
        let resp = self
            .req(reqwest::Method::GET, &format!("/v1/lifed/agent/{run_id}"))
            .send()
            .await?;
        let resp = self.check(resp).await?;
        Ok(resp.json().await?)
    }

    async fn list_sessions(
        &self,
        status: Option<RunStatus>,
        limit: Option<u32>,
    ) -> BroomvaResult<Vec<RunSummary>> {
        let mut req = self.req(reqwest::Method::GET, "/v1/lifed/agent");
        if let Some(s) = status {
            req = req.query(&[("status", s.label())]);
        }
        if let Some(n) = limit {
            req = req.query(&[("limit", n.to_string())]);
        }
        let resp = req.send().await?;
        let resp = self.check(resp).await?;
        Ok(resp.json().await?)
    }
}

// ── Buffered NDJSON event stream ────────────────────────────────────

struct BufferedEventStream {
    events: std::collections::VecDeque<RunEvent>,
}

impl BufferedEventStream {
    fn new(events: Vec<RunEvent>) -> Self {
        Self {
            events: events.into(),
        }
    }
}

#[async_trait::async_trait]
impl RunEventReader for BufferedEventStream {
    async fn next(&mut self) -> BroomvaResult<Option<RunEvent>> {
        Ok(self.events.pop_front())
    }
}

fn parse_ndjson_events(bytes: &[u8]) -> BroomvaResult<Vec<RunEvent>> {
    let s = std::str::from_utf8(bytes)
        .map_err(|e| BroomvaError::User(format!("lifed event stream not UTF-8: {e}")))?;
    let mut out = Vec::new();
    for (idx, line) in s.lines().enumerate() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        match serde_json::from_str::<RunEvent>(line) {
            Ok(evt) => out.push(evt),
            Err(e) => {
                // Forward-compat: skip unknown event kinds rather than
                // bailing on the whole stream. Mirrors the policy on
                // `lifegw` for unknown ws frames (Spec C₃ §6.5).
                tracing::warn!("lifed event line {} unparseable, skipping: {e}", idx + 1);
            }
        }
    }
    Ok(out)
}

// ── Tests ───────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use wiremock::matchers::{header, method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    fn test_client(base: String) -> LifedHttpClient {
        LifedHttpClient::new(base, Some("test-token".into()))
    }

    fn simple_spec() -> AgentTaskSpec {
        AgentTaskSpec {
            name: "test".into(),
            description: None,
            input: AgentInput {
                prompt: "hi".into(),
                variables: None,
            },
            agent: None,
            output: None,
        }
    }

    #[tokio::test]
    async fn create_session_posts_spec_and_returns_run_id() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/v1/lifed/agent/create-session"))
            .and(header("Authorization", "Bearer test-token"))
            .respond_with(ResponseTemplate::new(201).set_body_json(json!({
                "run_id": "01HXYZ",
                "status": "queued"
            })))
            .mount(&server)
            .await;

        let c = test_client(server.uri());
        let resp = c.create_session(&simple_spec()).await.unwrap();
        assert_eq!(resp.run_id, "01HXYZ");
        assert_eq!(resp.status, RunStatus::Queued);
    }

    #[tokio::test]
    async fn create_session_propagates_401_as_auth_required() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/v1/lifed/agent/create-session"))
            .respond_with(ResponseTemplate::new(401))
            .mount(&server)
            .await;

        let c = test_client(server.uri());
        match c.create_session(&simple_spec()).await {
            Err(BroomvaError::AuthRequired) => {}
            other => panic!("expected AuthRequired, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn stream_session_parses_ndjson() {
        let server = MockServer::start().await;
        let body = "\
{\"kind\":\"status_changed\",\"status\":\"running\"}
{\"kind\":\"tool_call\",\"name\":\"github_read\"}
{\"kind\":\"done\",\"status\":\"completed\",\"output\":{\"summary\":\"x\"}}
";
        Mock::given(method("GET"))
            .and(path("/v1/lifed/agent/01HX/stream"))
            .respond_with(ResponseTemplate::new(200).set_body_string(body))
            .mount(&server)
            .await;

        let c = test_client(server.uri());
        let mut stream = c.stream_session(&"01HX".into(), None).await.unwrap();
        let mut events = Vec::new();
        while let Some(evt) = stream.next().await.unwrap() {
            events.push(evt);
        }
        assert_eq!(events.len(), 3);
        match &events[2] {
            RunEvent::Done { status, output, .. } => {
                assert_eq!(*status, RunStatus::Completed);
                assert_eq!(
                    output.as_ref().unwrap().get("summary").unwrap(),
                    &json!("x")
                );
            }
            other => panic!("expected Done, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn stream_session_skips_unknown_kinds_for_forward_compat() {
        let server = MockServer::start().await;
        let body = "\
{\"kind\":\"future_event\",\"x\":1}
{\"kind\":\"status_changed\",\"status\":\"running\"}
";
        Mock::given(method("GET"))
            .and(path("/v1/lifed/agent/01HX/stream"))
            .respond_with(ResponseTemplate::new(200).set_body_string(body))
            .mount(&server)
            .await;

        let c = test_client(server.uri());
        let mut stream = c.stream_session(&"01HX".into(), None).await.unwrap();
        let first = stream.next().await.unwrap().unwrap();
        assert!(matches!(first, RunEvent::StatusChanged { .. }));
        assert!(stream.next().await.unwrap().is_none());
    }

    #[tokio::test]
    async fn cancel_session_returns_new_status() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/v1/lifed/agent/01HX/cancel"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "run_id": "01HX",
                "status": "cancelled"
            })))
            .mount(&server)
            .await;

        let c = test_client(server.uri());
        let s = c.cancel_session(&"01HX".into()).await.unwrap();
        assert_eq!(s, RunStatus::Cancelled);
    }

    #[tokio::test]
    async fn get_session_returns_detail() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/v1/lifed/agent/01HX"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "run_id": "01HX",
                "name": "t",
                "status": "completed",
                "created_at": "2026-05-18T00:00:00Z",
                "completed_at": "2026-05-18T00:00:01Z",
                "cost_usd": 0.123,
                "output": {"summary": "yay"}
            })))
            .mount(&server)
            .await;

        let c = test_client(server.uri());
        let d = c.get_session(&"01HX".into()).await.unwrap();
        assert_eq!(d.run_id, "01HX");
        assert_eq!(d.status, RunStatus::Completed);
        assert_eq!(d.cost_usd, Some(0.123));
    }

    #[tokio::test]
    async fn list_sessions_passes_query_params() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/v1/lifed/agent"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!([
                {
                    "run_id": "01A",
                    "name": "alpha",
                    "status": "completed",
                    "created_at": "2026-05-18T00:00:00Z"
                }
            ])))
            .mount(&server)
            .await;

        let c = test_client(server.uri());
        let rows = c
            .list_sessions(Some(RunStatus::Completed), Some(10))
            .await
            .unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].name, "alpha");
    }

    #[test]
    fn run_status_is_terminal_partitioning() {
        assert!(RunStatus::Completed.is_terminal());
        assert!(RunStatus::Failed.is_terminal());
        assert!(RunStatus::Cancelled.is_terminal());
        assert!(!RunStatus::Queued.is_terminal());
        assert!(!RunStatus::Running.is_terminal());
    }

    #[test]
    fn agent_task_spec_round_trips_through_json() {
        let spec = AgentTaskSpec {
            name: "rt".into(),
            description: Some("desc".into()),
            input: AgentInput {
                prompt: "p".into(),
                variables: Some(json!({"k": "v"})),
            },
            agent: Some(AgentConfig {
                backend: Some("claude-opus-4-7".into()),
                tools: Some(vec!["a".into(), "b".into()]),
                max_cost_usd: Some(2.5),
                timeout_seconds: Some(600),
                on_timeout: Some(OnTimeout::PartialOutput),
            }),
            output: Some(AgentOutput {
                schema: Some(json!({"type": "object"})),
                save_to: None,
            }),
        };
        let s = serde_json::to_string(&spec).unwrap();
        let back: AgentTaskSpec = serde_json::from_str(&s).unwrap();
        assert_eq!(back.name, "rt");
        assert_eq!(
            back.agent.as_ref().unwrap().on_timeout,
            Some(OnTimeout::PartialOutput)
        );
    }

    #[test]
    fn on_timeout_serializes_as_kebab_case() {
        let s = serde_json::to_string(&OnTimeout::PartialOutput).unwrap();
        assert_eq!(s, "\"partial-output\"");
    }
}
