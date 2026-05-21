//! lifed/lifegw client surfaces — Phase B.1.
//!
//! # Two surfaces in one file (BRO-1189)
//!
//! Phase B (v0.6.x) shipped a `LifedClient` trait + `LifedHttpClient`
//! impl that talked to a *hypothetical* `/v1/lifed/agent/...` HTTP/JSON
//! proxy. Empirical probing against `lumen-smoke` (BRO-1189) showed the
//! real lifegw mounts a different surface:
//!
//! * **Chat-session create** — HTTP POST `/v1/agent/create_session`
//!   on lifegw (Tier-1 Bearer; body `{user_id, project_id, label?,
//!   resume_sid?}`; returns `{sid, agent_id, user_id, project_id,
//!   created_at_unix}`). Defined at
//!   `~/broomva/core/life/crates/life-runtime/lifegw/src/services/agent_http.rs`.
//! * **Chat streaming** — WebSocket upgrade at `/v1/agent/stream` on
//!   lifegw (Tier-1 Bearer in `Authorization` header *or*
//!   `Sec-WebSocket-Protocol: bearer.<jwt>`; `?sid=<sid>` query;
//!   `?last_seq_no=<u64>` query for resume). Frames are JSON with
//!   `serde(tag = "kind", rename_all = "snake_case")`. Defined at
//!   `~/broomva/core/life/crates/life-runtime/lifegw/src/services/ws.rs`.
//! * **Typed task invocations (`broomva agent`)** — no HTTP/JSON
//!   surface on lifegw or lifed today. lifed only speaks gRPC over UDS.
//!   The legacy `LifedClient` trait is preserved below behind a
//!   "returns Unsupported" impl so `cli/agent.rs` keeps compiling; a
//!   real `broomva agent` wire contract is filed as a follow-up
//!   (BRO-1190).
//!
//! # Surface split for Phase B.1
//!
//! * [`LifegwChatClient`] — the **new** surface used by
//!   `cli/chat.rs` via `api::agent_stream::connect`. Talks to the real
//!   lifegw `/v1/agent/create_session` endpoint over HTTPS with the
//!   existing TLS dev-cert seam from BRO-1186.
//! * [`LifedClient`] / [`LifedHttpClient`] — the **legacy** trait and
//!   impl used by `cli/agent.rs`. Every method returns
//!   [`BroomvaError::Unsupported`]. `cli/agent.rs` continues to pass
//!   the schema-validation phase (the parts BRO-1189 deems in-scope)
//!   and then surfaces the unsupported error cleanly when it tries to
//!   dispatch. BRO-1190 will replace this with the real wire once
//!   lifed exposes one.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::time::Duration;

use crate::error::{BroomvaError, BroomvaResult};

// ───────────────────────────────────────────────────────────────────
// SECTION 1 — Real `LifegwChatClient` (BRO-1189 / Phase B.1)
// ───────────────────────────────────────────────────────────────────

/// Default lifegw base URL when no override is supplied. Production
/// callers point `LIFEGW_BASE_URL` (or the `--gateway-url` flag,
/// resolved in `chat.rs`) at the staging or production deployment.
pub const DEFAULT_LIFEGW_BASE_URL: &str = "https://lifegw.broomva.tech";

/// Per-HTTP-call deadline for the chat-session create. Matches the
/// gateway-side `UPSTREAM_RPC_TIMEOUT` (10s in `agent_http.rs`) — anything
/// slower is almost certainly a stuck saga and worth surfacing rather
/// than hanging the CLI.
pub const CREATE_SESSION_TIMEOUT: Duration = Duration::from_secs(12);

/// Body shape for POST `/v1/agent/create_session` — mirror of
/// `lifegw::services::agent_http::CreateSessionBody`. Field names + the
/// `deny_unknown_fields` posture are pinned by lifegw; bodies that
/// drift out of sync surface as 422 with the canonical error string.
#[derive(Debug, Clone, Serialize)]
pub struct CreateChatSessionBody {
    /// Tier-1 subject — MUST match the bearer's `sub` claim or lifegw
    /// returns 403. In dev with `dev-token-for-{user_id}` shortcuts,
    /// this is the `{user_id}` suffix.
    pub user_id: String,
    /// Project namespace lifed uses to scope the routing-cache entry.
    /// Pinned per session; "default" is acceptable for one-off chats.
    pub project_id: String,
    /// Optional human-readable label propagated to lifed (e.g. the
    /// chat session ULID on the CLI side).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    /// Optional sid to resume from. When set, lifed re-attaches the
    /// existing session rather than running the create-session saga
    /// again. Lifegw's `deny_unknown_fields` is strict — only emit
    /// when actually resuming.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resume_sid: Option<String>,
    /// Optional inference model the gateway should pin for the lifetime
    /// of this session (BRO-1207, Stream B). When `Some(id)`, lifegw
    /// stamps the model onto the routing-cache entry at session create
    /// time; lifed then attaches the model to every `ArcanCall` it
    /// dispatches for this `sid`. When `None`, the server's
    /// production default applies (currently `claude-sonnet-4-6`).
    ///
    /// `skip_serializing_if = "Option::is_none"` keeps the wire body
    /// byte-identical to v0.8.1 when no model is selected, so older
    /// servers (pre-Stream-A) still accept the request — they ignore
    /// unknown-to-them fields only when present, but since we omit on
    /// None there is nothing for them to reject. Stream A (lifegw PR
    /// #1406, merge `d3569bbd`) normalises empty/whitespace at the
    /// server, so the CLI does not need to strip whitespace itself.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
}

/// Response shape from POST `/v1/agent/create_session`. Mirror of
/// `lifegw::services::agent_http::CreateSessionResp`. The `sid` is the
/// short string the client carries on the subsequent
/// `wss://.../v1/agent/stream?sid=<sid>` upgrade.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateChatSessionResp {
    pub sid: String,
    pub agent_id: String,
    pub user_id: String,
    pub project_id: String,
    /// Unix-seconds — server clock; the CLI doesn't compute relative
    /// times against this but it's useful for tracing + telemetry.
    pub created_at_unix: i64,
}

/// Client for the lifegw chat-session create endpoint. Carries the
/// Tier-1 bearer + an optional TLS dev-cert path (BRO-1186 seam).
///
/// One client may be reused across multiple chat sessions — the inner
/// `reqwest::Client` pools connections so multi-turn / multi-session
/// CLIs only pay handshake cost once.
pub struct LifegwChatClient {
    base_url: String,
    token: Option<String>,
    http: reqwest::Client,
}

impl LifegwChatClient {
    /// Build a client with production TLS roots only. Use
    /// [`LifegwChatClient::with_dev_cert`] for `lumen-smoke` /
    /// self-signed staging gateways.
    pub fn new(base_url: String, token: Option<String>) -> Self {
        Self {
            base_url,
            token,
            http: reqwest::Client::builder()
                .timeout(CREATE_SESSION_TIMEOUT)
                .connect_timeout(Duration::from_secs(10))
                .build()
                .expect("reqwest client builder"),
        }
    }

    /// Build a client that appends `ca_cert_path` (PEM) to the webpki
    /// trust store. BRO-1186 seam — reuses
    /// [`crate::api::tls::load_extra_root_cert`].
    pub fn with_dev_cert(
        base_url: String,
        token: Option<String>,
        ca_cert_path: Option<&Path>,
    ) -> BroomvaResult<Self> {
        let mut builder = reqwest::Client::builder()
            .timeout(CREATE_SESSION_TIMEOUT)
            .connect_timeout(Duration::from_secs(10));
        if let Some(path) = ca_cert_path {
            let cert = crate::api::tls::load_extra_root_cert(path)?;
            builder = builder.add_root_certificate(cert);
        }
        let http = builder
            .build()
            .map_err(|e| BroomvaError::User(format!("reqwest client builder failed: {e}")))?;
        Ok(Self {
            base_url,
            token,
            http,
        })
    }

    fn url(&self, path: &str) -> String {
        format!(
            "{base}{sep}{path}",
            base = self.base_url.trim_end_matches('/'),
            sep = if path.starts_with('/') { "" } else { "/" }
        )
    }

    /// Hit POST `/v1/agent/create_session` and return the parsed
    /// response. Maps lifegw's typed error envelope to
    /// [`BroomvaError`] so the chat REPL can surface a useful message.
    ///
    /// On 401, returns [`BroomvaError::AuthRequired`] — the chat REPL
    /// uses that to prompt `broomva auth login`. On 422, returns
    /// [`BroomvaError::Api`] with the lifegw-side body verbatim
    /// (already operator-friendly; e.g. "unknown field 'name'").
    pub async fn create_chat_session(
        &self,
        body: &CreateChatSessionBody,
    ) -> BroomvaResult<CreateChatSessionResp> {
        let mut req = self
            .http
            .post(self.url("/v1/agent/create_session"))
            .json(body);
        if let Some(tok) = &self.token {
            req = req.header("Authorization", format!("Bearer {tok}"));
        }
        let resp = req.send().await.map_err(|e| {
            BroomvaError::User(format!(
                "create_chat_session: HTTP transport failed: {e} — \
                 is lifegw reachable at {}?",
                self.base_url
            ))
        })?;
        let status = resp.status();
        if status.as_u16() == 401 {
            return Err(BroomvaError::AuthRequired);
        }
        if !status.is_success() {
            let code = status.as_u16();
            let body_text = resp.text().await.unwrap_or_default();
            return Err(BroomvaError::Api {
                status: code,
                message: format!("lifegw POST /v1/agent/create_session: HTTP {code}"),
                body: Some(body_text),
            });
        }
        let parsed: CreateChatSessionResp = resp.json().await.map_err(|e| {
            BroomvaError::User(format!(
                "create_chat_session: response is not the expected JSON: {e}"
            ))
        })?;
        Ok(parsed)
    }
}

// ───────────────────────────────────────────────────────────────────
// SECTION 2 — Legacy `broomva agent` surface (deprecated, BRO-1190)
// ───────────────────────────────────────────────────────────────────
//
// These types were introduced in Phase B against a hypothetical lifed
// HTTP/JSON proxy. Empirical probing in BRO-1189 showed lifed only
// exposes gRPC over UDS — there is no HTTP/JSON surface to talk to,
// even via lifegw (which only forwards `/v1/agent/*` chat routes, not
// typed task RPCs).
//
// The trait + types are preserved so `cli/agent.rs` compiles and its
// schema-validation paths (which are correct + tested) stay live. The
// HTTP impl is replaced with one that fails fast — every method
// returns `BroomvaError::Unsupported` with a pointer at BRO-1190.

/// Per-run identifier — the ULID lifed assigns on `Agent.CreateSession`.
pub type RunId = String;

/// The task definition handed to `Agent.CreateSession`. Mirrors the
/// fields from `schemas/agent-task.v1.json` after validation.
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

/// Reply from `Agent.CreateSession` (legacy shape, kept for compile).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateSessionResponse {
    pub run_id: RunId,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
    pub status: RunStatus,
}

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

/// Single event emitted by `lifed.StreamSession` (legacy shape).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum RunEvent {
    StatusChanged {
        status: RunStatus,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        message: Option<String>,
    },
    ToolCall {
        name: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        args: Option<serde_json::Value>,
    },
    ToolResult {
        name: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        result: Option<serde_json::Value>,
    },
    Reasoning {
        text: String,
    },
    Output {
        text: String,
    },
    Cost {
        usd: f64,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        component: Option<String>,
    },
    Done {
        status: RunStatus,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        output: Option<serde_json::Value>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        cost_usd: Option<f64>,
    },
}

/// Summary row returned by `Agent.ListSessions` (legacy shape).
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

/// Detailed row returned by `Agent.GetSession` (legacy shape).
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

/// Boxed stream of [`RunEvent`].
pub type RunEventStream = Box<dyn RunEventReader + Send>;

#[async_trait::async_trait]
pub trait RunEventReader {
    async fn next(&mut self) -> BroomvaResult<Option<RunEvent>>;
}

/// Legacy trait — `broomva agent` calls these. BRO-1189 keeps them
/// compiling but every method returns
/// [`BroomvaError::Unsupported`]. Real impl tracked under BRO-1190.
#[async_trait::async_trait]
pub trait LifedClient: Send + Sync {
    async fn create_session(&self, spec: &AgentTaskSpec) -> BroomvaResult<CreateSessionResponse>;
    async fn stream_session(
        &self,
        run_id: &RunId,
        from_sequence: Option<u64>,
    ) -> BroomvaResult<RunEventStream>;
    async fn cancel_session(&self, run_id: &RunId) -> BroomvaResult<RunStatus>;
    async fn get_session(&self, run_id: &RunId) -> BroomvaResult<RunDetail>;
    async fn list_sessions(
        &self,
        status: Option<RunStatus>,
        limit: Option<u32>,
    ) -> BroomvaResult<Vec<RunSummary>>;
}

/// Legacy `LifedClient` impl. Every method fails fast with
/// [`BroomvaError::Unsupported`] until BRO-1190 ships a real wire.
///
/// The struct is preserved (rather than removed) so `cli/agent.rs`
/// compiles, the templates / schema / dry-run paths still work, and
/// the user gets a clean operator message instead of a misleading
/// "connection refused" against the fictional `/v1/lifed/...` routes
/// the Phase B code used to invent.
#[derive(Debug)]
pub struct LifedHttpClient {
    /// Captured for future use by the BRO-1190 real client. Today
    /// these are inert.
    #[allow(dead_code)]
    base_url: String,
    #[allow(dead_code)]
    token: Option<String>,
    #[allow(dead_code)]
    ca_cert_path: Option<PathBuf>,
}

impl LifedHttpClient {
    pub fn new(base_url: String, token: Option<String>) -> Self {
        Self {
            base_url,
            token,
            ca_cert_path: None,
        }
    }

    pub fn with_dev_cert(
        base_url: String,
        token: Option<String>,
        ca_cert_path: Option<&Path>,
    ) -> BroomvaResult<Self> {
        Ok(Self {
            base_url,
            token,
            ca_cert_path: ca_cert_path.map(|p| p.to_path_buf()),
        })
    }
}

const BRO_1190_MSG: &str = "`broomva agent` substrate wire is not implemented in v0.8.0 — \
     lifed only exposes gRPC over UDS and has no HTTP/JSON proxy yet. \
     The schema-validation + dry-run paths still work \
     (`broomva agent run --dry-run task.yaml`). \
     Real wire tracked at https://linear.app/broomva/issue/BRO-1190.";

#[async_trait::async_trait]
impl LifedClient for LifedHttpClient {
    async fn create_session(&self, _spec: &AgentTaskSpec) -> BroomvaResult<CreateSessionResponse> {
        Err(BroomvaError::Unsupported(BRO_1190_MSG.to_string()))
    }

    async fn stream_session(
        &self,
        _run_id: &RunId,
        _from_sequence: Option<u64>,
    ) -> BroomvaResult<RunEventStream> {
        Err(BroomvaError::Unsupported(BRO_1190_MSG.to_string()))
    }

    async fn cancel_session(&self, _run_id: &RunId) -> BroomvaResult<RunStatus> {
        Err(BroomvaError::Unsupported(BRO_1190_MSG.to_string()))
    }

    async fn get_session(&self, _run_id: &RunId) -> BroomvaResult<RunDetail> {
        Err(BroomvaError::Unsupported(BRO_1190_MSG.to_string()))
    }

    async fn list_sessions(
        &self,
        _status: Option<RunStatus>,
        _limit: Option<u32>,
    ) -> BroomvaResult<Vec<RunSummary>> {
        Err(BroomvaError::Unsupported(BRO_1190_MSG.to_string()))
    }
}

// ───────────────────────────────────────────────────────────────────
// Tests
// ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use wiremock::matchers::{body_json, header, method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    // ── New surface — `LifegwChatClient` (BRO-1189) ────────────────

    fn chat_client(base: String) -> LifegwChatClient {
        LifegwChatClient::new(base, Some("dev-token-for-test-user-1".into()))
    }

    fn alice_body() -> CreateChatSessionBody {
        CreateChatSessionBody {
            user_id: "test-user-1".into(),
            project_id: "smoke".into(),
            label: Some("b1-probe".into()),
            resume_sid: None,
            model: None,
        }
    }

    #[tokio::test]
    async fn create_chat_session_posts_body_and_returns_sid() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/v1/agent/create_session"))
            .and(header("Authorization", "Bearer dev-token-for-test-user-1"))
            .and(body_json(json!({
                "user_id": "test-user-1",
                "project_id": "smoke",
                "label": "b1-probe"
            })))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "sid": "01HXYZ-sid",
                "agent_id": "agent-01HXYZ",
                "user_id": "test-user-1",
                "project_id": "smoke",
                "created_at_unix": 1779283104i64
            })))
            .mount(&server)
            .await;

        let c = chat_client(server.uri());
        let resp = c.create_chat_session(&alice_body()).await.unwrap();
        assert_eq!(resp.sid, "01HXYZ-sid");
        assert_eq!(resp.agent_id, "agent-01HXYZ");
        assert_eq!(resp.user_id, "test-user-1");
    }

    #[tokio::test]
    async fn create_chat_session_propagates_401_as_auth_required() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/v1/agent/create_session"))
            .respond_with(ResponseTemplate::new(401).set_body_json(json!({
                "error": "invalid Tier-1: auth: decode header: InvalidToken"
            })))
            .mount(&server)
            .await;

        let c = chat_client(server.uri());
        match c.create_chat_session(&alice_body()).await {
            Err(BroomvaError::AuthRequired) => {}
            other => panic!("expected AuthRequired, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn create_chat_session_surfaces_422_body_verbatim() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/v1/agent/create_session"))
            .respond_with(ResponseTemplate::new(422).set_body_string(
                "Failed to deserialize the JSON body into the target type: \
                 name: unknown field `name`, expected one of `user_id`, `project_id`, \
                 `label`, `resume_sid`",
            ))
            .mount(&server)
            .await;

        let c = chat_client(server.uri());
        match c.create_chat_session(&alice_body()).await {
            Err(BroomvaError::Api {
                status,
                body: Some(body),
                ..
            }) => {
                assert_eq!(status, 422);
                assert!(body.contains("unknown field `name`"), "{body}");
            }
            other => panic!("expected Api 422, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn create_chat_session_resume_omits_field_when_absent() {
        // BRO-1189 — lifegw uses `deny_unknown_fields` AND treats
        // `resume_sid: null` differently from "absent". We
        // `skip_serializing_if = "Option::is_none"` to avoid sending
        // a null-valued field that future lifegw versions might
        // reject.
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/v1/agent/create_session"))
            // Match the EXACT body — note no `resume_sid` key.
            .and(body_json(json!({
                "user_id": "test-user-1",
                "project_id": "smoke",
                "label": "b1-probe"
            })))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "sid": "ok",
                "agent_id": "agent-ok",
                "user_id": "test-user-1",
                "project_id": "smoke",
                "created_at_unix": 1779283104i64
            })))
            .mount(&server)
            .await;

        let c = chat_client(server.uri());
        let resp = c.create_chat_session(&alice_body()).await.unwrap();
        assert_eq!(resp.sid, "ok");
    }

    #[tokio::test]
    async fn create_chat_session_resume_emits_field_when_present() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/v1/agent/create_session"))
            .and(body_json(json!({
                "user_id": "test-user-1",
                "project_id": "smoke",
                "label": "b1-probe",
                "resume_sid": "prior-sid"
            })))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "sid": "resumed",
                "agent_id": "agent-resumed",
                "user_id": "test-user-1",
                "project_id": "smoke",
                "created_at_unix": 1779283104i64
            })))
            .mount(&server)
            .await;

        let body = CreateChatSessionBody {
            user_id: "test-user-1".into(),
            project_id: "smoke".into(),
            label: Some("b1-probe".into()),
            resume_sid: Some("prior-sid".into()),
            model: None,
        };
        let c = chat_client(server.uri());
        let resp = c.create_chat_session(&body).await.unwrap();
        assert_eq!(resp.sid, "resumed");
    }

    #[tokio::test]
    async fn create_chat_session_transport_failure_returns_user_error() {
        // Hit an obviously-unreachable host so connect fails fast.
        let c = LifegwChatClient::new(
            "http://192.0.2.0:1".into(),
            Some("dev-token-for-test-user-1".into()),
        );
        match c.create_chat_session(&alice_body()).await {
            Err(BroomvaError::User(s)) => {
                assert!(s.contains("HTTP transport failed"), "{s}");
                assert!(s.contains("is lifegw reachable"), "{s}");
            }
            other => panic!("expected transport User error, got {other:?}"),
        }
    }

    #[test]
    fn create_chat_session_body_omits_optional_when_absent() {
        let body = CreateChatSessionBody {
            user_id: "alice".into(),
            project_id: "p".into(),
            label: Some("l".into()),
            resume_sid: None,
            model: None,
        };
        let json = serde_json::to_string(&body).unwrap();
        // resume_sid omitted, label present, model omitted (Stream B —
        // pre-Stream-A servers reject unknown fields, so we MUST omit
        // when None for backward compatibility).
        assert!(!json.contains("resume_sid"), "{json}");
        assert!(!json.contains("\"model\""), "{json}");
        assert!(json.contains("\"label\":\"l\""), "{json}");
    }

    // ── BRO-1207 (Stream B) — `model` field tests ──────────────────────

    #[tokio::test]
    async fn create_chat_session_emits_model_when_present() {
        // Verifies the CLI actually sends `model` in the body when set.
        // This is the load-bearing test for Stream B — Stream A's
        // lifegw server-side test (`creates_session_with_model_field`)
        // proves the gateway accepts it; this one proves the CLI sends it.
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/v1/agent/create_session"))
            .and(header("Authorization", "Bearer dev-token-for-test-user-1"))
            .and(body_json(json!({
                "user_id": "test-user-1",
                "project_id": "smoke",
                "label": "b1-probe",
                "model": "anthropic/claude-opus-4-7"
            })))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "sid": "opus-sid",
                "agent_id": "agent-opus",
                "user_id": "test-user-1",
                "project_id": "smoke",
                "created_at_unix": 1779283104i64
            })))
            .mount(&server)
            .await;

        let body = CreateChatSessionBody {
            user_id: "test-user-1".into(),
            project_id: "smoke".into(),
            label: Some("b1-probe".into()),
            resume_sid: None,
            model: Some("anthropic/claude-opus-4-7".into()),
        };
        let c = chat_client(server.uri());
        let resp = c.create_chat_session(&body).await.unwrap();
        assert_eq!(resp.sid, "opus-sid");
    }

    #[test]
    fn create_chat_session_body_serializes_model_when_some() {
        // Direct JSON shape assertion — ensures the wire byte-string
        // carries the model field when present.
        let body = CreateChatSessionBody {
            user_id: "alice".into(),
            project_id: "p".into(),
            label: None,
            resume_sid: None,
            model: Some("openai/gpt-4o".into()),
        };
        let json = serde_json::to_string(&body).unwrap();
        assert!(json.contains("\"model\":\"openai/gpt-4o\""), "{json}");
    }

    // ── Legacy surface — every method returns Unsupported ──────────

    #[tokio::test]
    async fn legacy_create_session_returns_unsupported() {
        let c = LifedHttpClient::new("https://lifed.broomva.tech".into(), Some("t".into()));
        let spec = AgentTaskSpec {
            name: "test".into(),
            description: None,
            input: AgentInput {
                prompt: "hi".into(),
                variables: None,
            },
            agent: None,
            output: None,
        };
        match c.create_session(&spec).await {
            Err(BroomvaError::Unsupported(s)) => {
                assert!(s.contains("BRO-1190"), "{s}");
            }
            other => panic!("expected Unsupported, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn legacy_stream_session_returns_unsupported() {
        let c = LifedHttpClient::new("https://lifed.broomva.tech".into(), Some("t".into()));
        match c.stream_session(&"01X".into(), None).await {
            Err(BroomvaError::Unsupported(_)) => {}
            // `Box<dyn RunEventReader>` doesn't implement Debug, so
            // we can't `{:?}` the whole result — print a generic
            // message instead.
            Ok(_) => panic!("expected Unsupported, got Ok stream"),
            Err(other) => panic!("expected Unsupported, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn legacy_list_sessions_returns_unsupported() {
        let c = LifedHttpClient::new("https://lifed.broomva.tech".into(), Some("t".into()));
        match c.list_sessions(None, None).await {
            Err(BroomvaError::Unsupported(_)) => {}
            other => panic!("expected Unsupported, got {other:?}"),
        }
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
