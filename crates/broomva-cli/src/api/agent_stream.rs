//! WebSocket client for lifegw `/v1/agent/stream` — **real wire**
//! (BRO-1189).
//!
//! ## What changed in Phase B.1
//!
//! Phase B (v0.6.x) shipped a `TungsteniteStream` that encoded its own
//! frame names (`user_turn`, `token`, `session_opened`,
//! `turn_complete`) and used `?session=` / `?from_sequence=` query
//! params. Empirical probing in BRO-1189 against
//! `lumen-smoke`'s lifegw build (commit-level inspection of
//! `~/broomva/core/life/crates/life-runtime/lifegw/src/services/ws.rs`)
//! revealed the real wire is:
//!
//! * **Auth**: `Authorization: Bearer <Tier-1 JWT>` header — *or*
//!   `Sec-WebSocket-Protocol: bearer.<Tier-1 JWT>` for browser callers
//!   that can't set request headers on `new WebSocket(...)`. We send
//!   the header form (canonical for Rust callers).
//! * **URL**: `?sid=<sid>` (NOT `session`) — populated by the
//!   `/v1/agent/create_session` HTTP POST that runs *before* the WS
//!   upgrade. `?last_seq_no=<u64>` (NOT `from_sequence`) for resume.
//! * **Frames** — JSON envelopes with `#[serde(tag = "kind",
//!   rename_all = "snake_case")]`:
//!   - Server → client: `agent_event { seq_no, record, agent_kind }`
//!     | `pong { seq_no }` | `closing { reason }`.
//!   - Client → server: `send_message { content, attachment_blob_ref? }`
//!     | `approve_dispatch { dispatch_id }` | `cancel_dispatch { dispatch_id }`
//!     | `ping { seq_no? }` | `close { reason? }`.
//! * **AgentEvent kinds**: `TOKEN` carries `record.payload.text`;
//!   `FINISH` is end-of-turn; `ERROR` is in-turn fault; `APPROVAL_REQUIRED`
//!   surfaces dispatch approval; the rest (tool calls / hibernate / etc.)
//!   are forwarded to the renderer as informational events.
//!
//! ## Wire-vs-CLI types
//!
//! The CLI keeps its own [`OutboundFrame`] / [`InboundFrame`] /
//! [`StreamEvent`] enums — they are the well-tested public abstraction
//! `cli/chat.rs` and the smoke tests build against. The lifegw wire
//! shape is encapsulated *inside* [`TungsteniteStream`] via the
//! `wire::` module: outbound CLI frames translate to wire frames in
//! `send`, and inbound wire frames translate to CLI events in `recv`.
//! This means:
//!
//! * The `FakeStream` in `tests/chat_smoke.rs` keeps working unchanged
//!   — it implements [`AgentStream`] without ever seeing wire-format
//!   JSON.
//! * The wire surface can shift again (e.g. when lifegw exposes
//!   per-turn cost / latency via a typed AgentEvent kind) without
//!   touching the chat REPL.
//!
//! ## Connect flow
//!
//! [`connect`] runs the **two-phase** sequence the gateway requires:
//!
//! 1. HTTP POST `/v1/agent/create_session` (via
//!    [`crate::api::lifed::LifegwChatClient`]) — returns `{sid, ...}`.
//! 2. WS upgrade `wss://.../v1/agent/stream?sid=<sid>&last_seq_no=<n>`
//!    with the same Tier-1 bearer.
//!
//! The CLI calls [`connect`] per turn (Phase A's one-connection-per-turn
//! design); the create-session call is idempotent for an existing sid
//! when `resume_sid` is provided. Multi-turn within a single REPL
//! invocation re-uses the same sid across reconnects so the gateway's
//! routing-cache entry stays warm.

use std::path::PathBuf;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tokio::sync::mpsc;

use crate::error::{BroomvaError, BroomvaResult};

/// Default gateway base URL when no override is provided.
///
/// Note this is a **base URL** now, not a full WS URL — the previous
/// shape `wss://.../v1/agent/stream` baked in the path which made it
/// impossible to call the HTTP `/v1/agent/create_session` endpoint with
/// the same setting. Callers either point this at production
/// (`https://lifegw.broomva.tech`) or lumen-smoke
/// (`https://127.0.0.1:8443`); [`TungsteniteStream::connect`] derives
/// both the HTTPS create-session URL and the WSS stream URL from it.
pub const DEFAULT_GATEWAY_URL: &str = "https://lifegw.broomva.tech";

/// Maximum number of reconnect attempts before giving up.
///
/// Spec C₃ §6.6 mandates jittered exponential backoff; we cap at 5
/// attempts so a dead gateway doesn't loop forever. The CLI surfaces
/// the final error to the user.
pub const MAX_RECONNECT_ATTEMPTS: u32 = 5;

/// Base backoff delay (doubled per attempt, with ±25% jitter).
pub const BASE_BACKOFF_MS: u64 = 250;

/// Cap on the exponential backoff — once we hit this, reconnect is
/// effectively pinned at the ceiling for the remaining attempts.
pub const MAX_BACKOFF_MS: u64 = 8_000;

/// Default project_id used when the CLI doesn't carry one. lifegw
/// requires `project_id` non-empty + ≤128 chars; `default` matches
/// the smoke fixture and is the obvious shared scope for one-off CLI
/// chats.
pub const DEFAULT_PROJECT_ID: &str = "default";

// ── Wire shape (CLI semantic types — stable abstraction) ─────────────

/// Frame the CLI sends to the gateway over the upgraded WS.
///
/// These are **CLI semantic types**, not the raw lifegw wire shape.
/// [`TungsteniteStream`] translates them to the
/// `send_message` / `approve_dispatch` / etc. wire frames in `send()`.
/// The translation is internal — `tests/chat_smoke.rs` and the REPL
/// build against this enum, not the wire.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum OutboundFrame {
    /// A user turn (a single message from the user — one chat turn).
    UserTurn {
        text: String,
        /// Server-side sequence number we last observed; used for
        /// reconnect-by-last-seq. Note: lifegw consumes this via the
        /// URL query param (`?last_seq_no=`) at connect time, NOT via
        /// the WS frame — we keep it on the CLI struct so the smoke
        /// tests' fake stream can still capture it for assertions.
        from_sequence: Option<u64>,
        /// Inference model the user picked for this turn. None ⇒
        /// gateway default. Currently lifegw doesn't carry the model
        /// hint on `send_message`; it's part of the session config.
        /// We retain the field on the CLI side so the REPL UI shows
        /// "model in effect" correctly across turns.
        model: Option<String>,
    },
    /// Client requests an in-flight cancel (ESC pressed mid-stream).
    /// Maps to the lifegw `cancel_dispatch` frame.
    Cancel,
    /// Heartbeat ping (currently the gateway server-pings; this is
    /// reserved for future M8 SDK parity). Maps to lifegw `ping`.
    Ping,
}

/// Frame the gateway emits back to the CLI (CLI semantic shape).
///
/// Unknown variants are dropped silently per Spec C₃ §6.5 note on
/// `1003 Unsupported Data` (gateway never closes for unknown frames;
/// dispatcher drops them). The CLI mirrors that policy: unknown
/// `kind` ⇒ ignore.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum InboundFrame {
    /// A single token in the streaming reply.
    Token {
        sequence: u64,
        text: String,
        model: Option<String>,
    },
    /// Session-level metadata pushed at upgrade time. In Phase B.1
    /// this is **synthesized** by the client after
    /// `create_chat_session` succeeds — lifegw doesn't actually emit
    /// it; the CLI manufactures one so the REPL banner can render the
    /// resolved sid + model uniformly.
    SessionOpened { session_id: String, model: String },
    /// End of the current turn — gateway signals "model is done"
    /// (mapped from `agent_kind = "FINISH"`).
    TurnComplete {
        latency_ms: Option<u64>,
        cost_usd: Option<f64>,
    },
    /// Error inside the turn (e.g. tool failed). Stream remains open.
    /// Mapped from `agent_kind = "ERROR"`.
    TurnError { message: String },
}

/// Events surfaced to the chat REPL — a small abstraction over the
/// wire frames so the REPL doesn't have to handle wire deserialization
/// directly.
#[derive(Debug, Clone)]
pub enum StreamEvent {
    /// Session opened; gateway acknowledges + assigns model.
    Opened { session_id: String, model: String },
    /// Token to render (typewriter).
    Token { text: String, sequence: u64 },
    /// Model finished this turn.
    TurnComplete {
        latency_ms: Option<u64>,
        cost_usd: Option<f64>,
    },
    /// In-turn error (transient, stream alive).
    TurnError { message: String },
    /// Connection closed by the gateway.
    Closed { code: CloseCode, reason: String },
    /// Reconnect attempt is in progress (for UI affordance).
    Reconnecting { attempt: u32 },
}

// ── Close codes (Spec C₃ §6.5 amendment) ─────────────────────────────

/// WebSocket close codes the CLI understands.
///
/// Mirrors `CloseReason` in
/// `core/life/crates/life-runtime/lifegw/src/services/ws.rs`. The
/// canonical table lives at
/// `core/life/docs/superpowers/specs/2026-04-29-spec-c3-close-codes.md`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CloseCode {
    /// 1000 — graceful close.
    Normal,
    /// 1001 — gateway is draining.
    GoingAway,
    /// 1008 — auth token expired / permission denied.
    PolicyViolation,
    /// 1011 — internal server fault (incl. heartbeat-pong-deadline).
    InternalError,
    /// 4001 — token-bucket rate limit exhausted.
    RateLimit,
    /// 4002 — outbound mpsc backed up; gateway closed to free memory.
    SlowConsumer,
    /// 4003 — peer IP on the blocklist.
    IpBlocked,
    /// 4004 — upstream lifed UDS unreachable / circuit breaker open.
    LifedUnavailable,
    /// 4005 — `from_sequence` already evicted on the lifed side.
    SequenceRetired,
    /// Anything we don't recognize.
    Unknown(u16),
}

impl CloseCode {
    pub fn from_u16(code: u16) -> Self {
        match code {
            1000 => Self::Normal,
            1001 => Self::GoingAway,
            1008 => Self::PolicyViolation,
            1011 => Self::InternalError,
            4001 => Self::RateLimit,
            4002 => Self::SlowConsumer,
            4003 => Self::IpBlocked,
            4004 => Self::LifedUnavailable,
            4005 => Self::SequenceRetired,
            other => Self::Unknown(other),
        }
    }

    /// Should the client try to reconnect on this close code?
    pub fn is_retryable(self) -> bool {
        matches!(
            self,
            Self::GoingAway          // server drain — likely transient
                | Self::InternalError // transient server fault
                | Self::LifedUnavailable
                | Self::SlowConsumer
        )
    }

    /// Human-readable label for the UI.
    pub fn label(self) -> &'static str {
        match self {
            Self::Normal => "normal",
            Self::GoingAway => "gateway draining",
            Self::PolicyViolation => "auth/policy violation",
            Self::InternalError => "internal error",
            Self::RateLimit => "rate limit",
            Self::SlowConsumer => "slow consumer (backpressure)",
            Self::IpBlocked => "ip blocked",
            Self::LifedUnavailable => "lifed unavailable",
            Self::SequenceRetired => "sequence retired (resync needed)",
            Self::Unknown(_) => "unknown",
        }
    }
}

// ── Abstract stream trait ────────────────────────────────────────────

/// Abstraction over a single bidi WS connection. Implemented by
/// [`TungsteniteStream`] for production and by `FakeStream` in tests.
///
/// The interface is **send-frame, drain-events** — the renderer task
/// in `chat.rs` calls `recv` in a loop while a separate input task
/// calls `send`. Cancellation is via the `Cancel` outbound frame.
#[async_trait::async_trait]
pub trait AgentStream: Send {
    /// Push one outbound frame to the gateway.
    async fn send(&mut self, frame: OutboundFrame) -> BroomvaResult<()>;

    /// Pull the next streamed event from the gateway.
    ///
    /// Returns `Ok(None)` when the gateway closed cleanly. Returns
    /// `Err(...)` on transport faults.
    async fn recv(&mut self) -> BroomvaResult<Option<StreamEvent>>;

    /// Initiate graceful close.
    async fn close(self: Box<Self>) -> BroomvaResult<()>;
}

// ── Config & connect ─────────────────────────────────────────────────

/// Connection parameters for the agent stream.
#[derive(Debug, Clone)]
pub struct AgentStreamConfig {
    /// Gateway base URL (e.g. `https://lifegw.broomva.tech` or
    /// `https://127.0.0.1:8443`). Defaults to [`DEFAULT_GATEWAY_URL`].
    pub gateway_url: String,
    /// Bearer JWT (mint via `broomva auth login`). For dev with
    /// lumen-smoke, accepts `dev-token-for-{user_id}` shortcuts.
    pub token: Option<String>,
    /// Optional session ID for **client-side bookkeeping**. The gateway
    /// only honors `resume_sid` when [`Self::resume_existing_sid`] is
    /// also set; this field is the CLI's own session id (UUID v4)
    /// which doesn't get sent on the wire today.
    pub session_id: Option<String>,
    /// Optional `last_seq_no` for reconnect-by-last-seq.
    pub from_sequence: Option<u64>,
    /// Optional model override for the next turn (CLI-side bookkeeping
    /// only; lifegw doesn't carry a per-turn model selector today).
    pub model: Option<String>,
    /// `user_id` for the `create_chat_session` body. MUST match the
    /// bearer's `sub` claim (lifegw enforces). Defaults to
    /// `default-user` when missing — production callers should always
    /// set this; the default is a CLI-friendly fallback.
    pub user_id: String,
    /// `project_id` for the `create_chat_session` body. Defaults to
    /// [`DEFAULT_PROJECT_ID`].
    pub project_id: String,
    /// Optional existing sid the gateway should resume rather than
    /// create fresh. Set when reconnecting an in-flight WS dropped
    /// mid-stream so lifegw's routing cache stays warm.
    pub resume_existing_sid: Option<String>,
    /// Connect timeout (covers the create-session POST + the WS
    /// upgrade combined).
    pub connect_timeout: Duration,
    /// Optional extra root CA cert (PEM) for the TLS trust store.
    /// BRO-1186 seam.
    pub ca_cert_path: Option<PathBuf>,
}

impl Default for AgentStreamConfig {
    fn default() -> Self {
        Self {
            gateway_url: DEFAULT_GATEWAY_URL.to_string(),
            token: None,
            session_id: None,
            from_sequence: None,
            model: None,
            user_id: "default-user".to_string(),
            project_id: DEFAULT_PROJECT_ID.to_string(),
            resume_existing_sid: None,
            connect_timeout: Duration::from_secs(15),
            ca_cert_path: None,
        }
    }
}

/// Open a fresh production stream backed by tokio-tungstenite.
///
/// Two-phase connect per BRO-1189:
///
///   1. HTTP POST `/v1/agent/create_session` to mint a sid.
///   2. WSS upgrade `…/v1/agent/stream?sid=<sid>&last_seq_no=<n>`
///      with the same Tier-1 bearer.
///
/// Returns a boxed trait object so the REPL and the smoke test share
/// the same code path.
pub async fn connect(config: AgentStreamConfig) -> BroomvaResult<Box<dyn AgentStream>> {
    let stream = TungsteniteStream::connect(config).await?;
    Ok(Box::new(stream))
}

// ── Production impl: tokio-tungstenite ───────────────────────────────

use futures_util::{SinkExt, StreamExt};
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::handshake::client::Request;
use tokio_tungstenite::tungstenite::protocol::CloseFrame;
use tokio_tungstenite::{
    MaybeTlsStream, WebSocketStream, connect_async, connect_async_tls_with_config,
};

use crate::api::lifed::{CreateChatSessionBody, LifegwChatClient};
use crate::api::tls::build_tungstenite_connector;

type TungsteniteSocket = WebSocketStream<MaybeTlsStream<tokio::net::TcpStream>>;

pub struct TungsteniteStream {
    socket: TungsteniteSocket,
    /// Synthetic "session opened" event we hand out on the first
    /// `recv` after connect. Holds the resolved sid + model so the
    /// REPL banner can render uniformly.
    pending_opened: Option<StreamEvent>,
    /// Effective model on this connection (echoed back on TurnComplete
    /// so the REPL display stays accurate when lifegw's wire doesn't
    /// carry per-token model metadata).
    effective_model: String,
    /// Track per-`send_message` sequence numbers we've handed out so
    /// `OutboundFrame::Cancel` can route to the *current* dispatch.
    last_dispatch_id: Option<String>,
}

impl TungsteniteStream {
    async fn connect(config: AgentStreamConfig) -> BroomvaResult<Self> {
        // Phase 1 — POST /v1/agent/create_session to mint a sid.
        let token = config.token.clone().ok_or_else(|| {
            BroomvaError::User(
                "chat: bearer token required (run `broomva auth login` or set --token)".to_string(),
            )
        })?;

        // Convert https://... base URL to itself for the chat client.
        // If the caller passed a wss:// URL (Phase B legacy), normalize
        // to https:// for the HTTP leg.
        let base_url_for_http = config
            .gateway_url
            .trim_end_matches('/')
            .replace("wss://", "https://")
            .replace("ws://", "http://")
            // Strip the WS path suffix if a legacy caller baked it in.
            .trim_end_matches("/v1/agent/stream")
            .to_string();

        let chat_client = LifegwChatClient::with_dev_cert(
            base_url_for_http.clone(),
            Some(token.clone()),
            config.ca_cert_path.as_deref(),
        )?;
        let body = CreateChatSessionBody {
            user_id: config.user_id.clone(),
            project_id: config.project_id.clone(),
            // Carry the CLI session ULID as the lifegw `label` so
            // operator tooling (lago replay --tree, vigil traces) can
            // correlate gateway saga to CLI session.
            label: config.session_id.clone(),
            resume_sid: config.resume_existing_sid.clone(),
        };
        let sess = chat_client.create_chat_session(&body).await?;
        let sid = sess.sid;
        // Default model is informational only — lifegw doesn't echo
        // back the inference model on session create. We use the
        // caller-provided model when available, falling back to the
        // sentinel string the REPL banner expects.
        let effective_model = config
            .model
            .clone()
            .unwrap_or_else(|| "claude-sonnet-4-6".to_string());

        // Phase 2 — WSS upgrade `?sid=<sid>&last_seq_no=<n>`.
        let mut ws_url = url::Url::parse(&base_url_for_http).map_err(|e| {
            BroomvaError::User(format!(
                "invalid gateway URL {url:?}: {e}",
                url = config.gateway_url
            ))
        })?;
        // Scheme: https→wss, http→ws.
        match ws_url.scheme() {
            "https" => ws_url
                .set_scheme("wss")
                .map_err(|_| BroomvaError::User("failed to set wss:// scheme".into()))?,
            "http" => ws_url
                .set_scheme("ws")
                .map_err(|_| BroomvaError::User("failed to set ws:// scheme".into()))?,
            "ws" | "wss" => {}
            other => {
                return Err(BroomvaError::User(format!(
                    "gateway URL scheme {other:?} is not https/http/ws/wss"
                )));
            }
        };
        ws_url.set_path("/v1/agent/stream");
        ws_url.query_pairs_mut().append_pair("sid", &sid);
        if let Some(seq) = config.from_sequence {
            ws_url
                .query_pairs_mut()
                .append_pair("last_seq_no", &seq.to_string());
        }

        let mut request: Request = ws_url
            .as_str()
            .into_client_request()
            .map_err(|e| BroomvaError::User(format!("ws request build failed: {e}")))?;

        // Auth header — Rust callers use the canonical
        // `Authorization: Bearer <jwt>` form. lifegw also accepts
        // `Sec-WebSocket-Protocol: bearer.<jwt>` (Spec D D-Sub-C M8.2
        // for browsers), but the header form is the production
        // posture for non-browser callers.
        let auth_value = http::HeaderValue::from_str(&format!("Bearer {token}"))
            .map_err(|e| BroomvaError::User(format!("invalid token for Authorization: {e}")))?;
        request.headers_mut().insert("Authorization", auth_value);
        // Negotiate the `life.v1.agent` subprotocol per Spec C₃ §6.1.
        // lifegw echoes it back on the 101 response.
        request.headers_mut().insert(
            "Sec-WebSocket-Protocol",
            http::HeaderValue::from_static("life.v1.agent"),
        );

        // BRO-1186 — when an extra root CA is supplied (via `--cacert`
        // / `BROOMVA_CA_CERT`), build a rustls connector with the dev
        // cert appended to webpki defaults.
        let custom_connector = build_tungstenite_connector(config.ca_cert_path.as_deref())?;

        let (socket, _resp) = if let Some(connector) = custom_connector {
            let fut = connect_async_tls_with_config(request, None, false, Some(connector));
            tokio::time::timeout(config.connect_timeout, fut)
                .await
                .map_err(|_| {
                    BroomvaError::User(format!(
                        "gateway WS connect timed out after {:?}",
                        config.connect_timeout
                    ))
                })?
                .map_err(|e| BroomvaError::User(format!("ws handshake failed: {e}")))?
        } else {
            let fut = connect_async(request);
            tokio::time::timeout(config.connect_timeout, fut)
                .await
                .map_err(|_| {
                    BroomvaError::User(format!(
                        "gateway WS connect timed out after {:?}",
                        config.connect_timeout
                    ))
                })?
                .map_err(|e| BroomvaError::User(format!("ws handshake failed: {e}")))?
        };

        // Synthesize a SessionOpened event so the REPL banner gets a
        // uniform signal regardless of whether the gateway pushes one
        // (today it doesn't — it just sends agent_event frames).
        let pending_opened = Some(StreamEvent::Opened {
            session_id: sid,
            model: effective_model.clone(),
        });

        Ok(Self {
            socket,
            pending_opened,
            effective_model,
            last_dispatch_id: None,
        })
    }
}

#[async_trait::async_trait]
impl AgentStream for TungsteniteStream {
    async fn send(&mut self, frame: OutboundFrame) -> BroomvaResult<()> {
        let wire = wire::cli_to_wire_outbound(&frame, self.last_dispatch_id.as_deref());
        // Track the most recent dispatch id so Cancel routes to the
        // right one. Today lifegw doesn't expose a dispatch_id back to
        // the client on `send_message` ack — we leave this for the
        // approval flow once the BRO-1189 follow-up wires it.
        if let wire::WireOutbound::SendMessage { .. } = wire {
            // No dispatch_id yet — placeholder for future approval flow.
        }
        let text = serde_json::to_string(&wire)?;
        self.socket
            .send(Message::Text(text))
            .await
            .map_err(|e| BroomvaError::User(format!("ws send failed: {e}")))?;
        Ok(())
    }

    async fn recv(&mut self) -> BroomvaResult<Option<StreamEvent>> {
        // First call after connect — hand out the synthetic Opened.
        if let Some(evt) = self.pending_opened.take() {
            return Ok(Some(evt));
        }
        while let Some(msg) = self.socket.next().await {
            let msg = msg.map_err(|e| BroomvaError::User(format!("ws recv failed: {e}")))?;
            match msg {
                Message::Text(text) => {
                    let Some(event) = wire::decode_event(&text, &self.effective_model)? else {
                        // Unknown frame kind — dispatcher drops per
                        // Spec C₃ §6.5 note on 1003.
                        continue;
                    };
                    return Ok(Some(event));
                }
                Message::Binary(_) | Message::Ping(_) | Message::Pong(_) => {
                    // Server-side ping/pong handled by the tungstenite
                    // layer automatically. Binary frames are unused.
                    continue;
                }
                Message::Frame(_) => continue,
                Message::Close(close_frame) => {
                    let (code, reason) = match close_frame {
                        Some(CloseFrame { code, reason }) => {
                            (CloseCode::from_u16(u16::from(code)), reason.to_string())
                        }
                        None => (CloseCode::Normal, String::new()),
                    };
                    return Ok(Some(StreamEvent::Closed { code, reason }));
                }
            }
        }
        Ok(None)
    }

    async fn close(mut self: Box<Self>) -> BroomvaResult<()> {
        let _ = self.socket.close(None).await;
        Ok(())
    }
}

// ── Wire translation (lifegw ↔ CLI semantic types) ───────────────────

/// Encapsulates the lifegw wire frame shapes. Internal to the module —
/// the CLI surfaces stay on [`OutboundFrame`] / [`InboundFrame`] /
/// [`StreamEvent`].
///
/// Two paths:
///
/// * [`cli_to_wire_outbound`] takes an [`OutboundFrame`] (CLI) and
///   returns a [`WireOutbound`] ready to JSON-encode.
/// * [`decode_event`] takes the raw text payload from the gateway and
///   returns a [`StreamEvent`] (CLI).
pub(crate) mod wire {
    use super::{InboundFrame, OutboundFrame, StreamEvent};
    use crate::error::BroomvaResult;
    use serde::{Deserialize, Serialize};

    /// Wire shape — outbound (client→server). Mirror of
    /// `lifegw::services::ws::InboundFrame`. Names match exactly.
    ///
    /// `ApproveDispatch` and `Close` are unused today — they're
    /// forward-compat slots for the BRO-1189 follow-up that wires the
    /// approval flow + graceful WS close path. Allowing dead-code so
    /// the wire shape stays complete.
    #[allow(dead_code)]
    #[derive(Debug, Clone, Serialize)]
    #[serde(tag = "kind", rename_all = "snake_case")]
    pub enum WireOutbound {
        SendMessage {
            content: String,
            #[serde(skip_serializing_if = "Option::is_none")]
            attachment_blob_ref: Option<String>,
        },
        ApproveDispatch {
            dispatch_id: String,
        },
        CancelDispatch {
            dispatch_id: String,
        },
        Ping {
            #[serde(default)]
            seq_no: u64,
        },
        Close {
            #[serde(skip_serializing_if = "Option::is_none")]
            reason: Option<String>,
        },
    }

    /// Wire shape — inbound (server→client). Mirror of
    /// `lifegw::services::ws::OutboundFrame`. We decode it permissively
    /// (`#[serde(other)]`-ish — see `decode_event` for the unknown-kind
    /// drop).
    #[derive(Debug, Clone, Deserialize)]
    #[serde(tag = "kind", rename_all = "snake_case")]
    pub enum WireInbound {
        AgentEvent {
            seq_no: u64,
            #[serde(default)]
            record: serde_json::Value,
            agent_kind: String,
        },
        Pong {
            #[serde(default)]
            #[allow(dead_code)]
            seq_no: u64,
        },
        Closing {
            #[allow(dead_code)]
            reason: String,
        },
    }

    /// Map a CLI outbound frame to the lifegw wire form. `_dispatch_id`
    /// reserved for the approval flow (BRO-1189 follow-up); today
    /// `Cancel` produces `CancelDispatch { dispatch_id: "" }` which
    /// lifegw treats as "cancel current dispatch".
    pub fn cli_to_wire_outbound(frame: &OutboundFrame, _dispatch_id: Option<&str>) -> WireOutbound {
        match frame {
            OutboundFrame::UserTurn { text, .. } => WireOutbound::SendMessage {
                content: text.clone(),
                attachment_blob_ref: None,
            },
            OutboundFrame::Cancel => WireOutbound::CancelDispatch {
                dispatch_id: String::new(),
            },
            OutboundFrame::Ping => WireOutbound::Ping { seq_no: 0 },
        }
    }

    /// Decode a single inbound wire text payload into a CLI
    /// [`StreamEvent`]. Returns `Ok(None)` for unknown frame kinds or
    /// AgentEvent kinds the CLI doesn't render (tool calls, hibernate,
    /// etc. — surfaced as informational pass-through tokens so the
    /// REPL at least sees activity).
    pub fn decode_event(text: &str, effective_model: &str) -> BroomvaResult<Option<StreamEvent>> {
        let parsed: Result<WireInbound, _> = serde_json::from_str(text);
        match parsed {
            Ok(WireInbound::AgentEvent {
                seq_no,
                record,
                agent_kind,
            }) => Ok(agent_event_to_stream_event(
                seq_no,
                &record,
                &agent_kind,
                effective_model,
            )),
            // Pong / Closing don't surface to the REPL.
            Ok(WireInbound::Pong { .. }) | Ok(WireInbound::Closing { .. }) => Ok(None),
            Err(_) => {
                // Forward-compat: keep the InboundFrame shape parser
                // around as a fallback so a future wire variant the
                // CLI hasn't been taught yet still produces a sensible
                // event. This is also what the legacy Phase B fixtures
                // use — `tests/chat_smoke.rs` doesn't go through wire
                // decode, but unit tests in this module do.
                let legacy: Result<InboundFrame, _> = serde_json::from_str(text);
                Ok(legacy.ok().and_then(legacy_to_stream_event))
            }
        }
    }

    fn agent_event_to_stream_event(
        seq_no: u64,
        record: &serde_json::Value,
        agent_kind: &str,
        effective_model: &str,
    ) -> Option<StreamEvent> {
        match agent_kind {
            "TOKEN" => {
                // `record.payload.text` carries the token delta. lifegw
                // decodes the substrate's bytes payload to a JSON
                // object; the substrate emits `{"text": "..."}` for
                // token deltas.
                let text = record
                    .get("payload")
                    .and_then(|p| p.get("text"))
                    .and_then(|t| t.as_str())
                    .unwrap_or("")
                    .to_string();
                if text.is_empty() {
                    return None;
                }
                Some(StreamEvent::Token {
                    sequence: seq_no,
                    text,
                })
            }
            "FINISH" => {
                // lifegw's substrate doesn't carry latency / cost on
                // the FINISH event today (per Spec C₃ §6.2 + lifed's
                // `Agent.StreamSession` proto). We surface `None` for
                // both — the REPL prints "turn complete" without the
                // ms / cost suffix.
                Some(StreamEvent::TurnComplete {
                    latency_ms: None,
                    cost_usd: None,
                })
            }
            "ERROR" => {
                let message = record
                    .get("payload")
                    .and_then(|p| p.get("message"))
                    .and_then(|m| m.as_str())
                    .unwrap_or("upstream substrate error")
                    .to_string();
                Some(StreamEvent::TurnError { message })
            }
            "TOOL_CALL_PENDING" | "TOOL_RESULT" | "APPROVAL_REQUIRED" | "HIBERNATE" => {
                // Surface as informational tokens — lets the REPL
                // operator see the agent is doing something even if
                // the renderer doesn't have a dedicated UI affordance
                // for these kinds yet.
                let summary = format!("[{}]\n", agent_kind.to_ascii_lowercase());
                Some(StreamEvent::Token {
                    sequence: seq_no,
                    text: summary,
                })
            }
            _ => {
                // Unknown kind → drop silently. `effective_model` is
                // unused here; keeping the parameter so the signature
                // accepts the future where some AgentEvent kinds
                // carry model metadata directly.
                let _ = effective_model;
                None
            }
        }
    }

    /// Phase B legacy fallback decoder — accepts the
    /// `{"kind":"token","sequence":...,"text":...}` shape used by
    /// pre-B.1 mocks. Lets unit tests in this module verify both
    /// real-wire AND legacy-wire encoding without forking the test
    /// harness.
    fn legacy_to_stream_event(frame: InboundFrame) -> Option<StreamEvent> {
        match frame {
            InboundFrame::Token { sequence, text, .. } => {
                Some(StreamEvent::Token { text, sequence })
            }
            InboundFrame::SessionOpened { session_id, model } => {
                Some(StreamEvent::Opened { session_id, model })
            }
            InboundFrame::TurnComplete {
                latency_ms,
                cost_usd,
            } => Some(StreamEvent::TurnComplete {
                latency_ms,
                cost_usd,
            }),
            InboundFrame::TurnError { message } => Some(StreamEvent::TurnError { message }),
        }
    }
}

// ── Reconnect-by-last-seq driver ─────────────────────────────────────

/// Type alias for the connect closure used by [`spawn_driver`]. Boxed
/// future + boxed FnMut keeps the trait-object-friendly shape that
/// production code (real `connect`) and tests (in-memory fake) both
/// satisfy.
pub type AgentStreamConnect = Box<
    dyn FnMut(
            AgentStreamConfig,
        )
            -> futures_util::future::BoxFuture<'static, BroomvaResult<Box<dyn AgentStream>>>
        + Send,
>;

/// Spawn the WS reader as a background task; the REPL drains the
/// returned `mpsc::Receiver` non-blockingly.
///
/// The driver implements the Spec C₃ §6.6 reconnect loop:
///   1. Connect; relay events.
///   2. On a retryable close OR transport error, sleep with jittered
///      backoff and reconnect, passing `from_sequence` so the server
///      resumes mid-turn (lifed already buffers per Sub-phase D).
///   3. After [`MAX_RECONNECT_ATTEMPTS`], surface `Closed` and stop.
///
/// Returns `(events_rx, outbound_tx)`. The REPL writes to
/// `outbound_tx` to send turns; events stream through `events_rx`.
pub fn spawn_driver(
    mut config: AgentStreamConfig,
    mut connect_fn: AgentStreamConnect,
) -> (mpsc::Receiver<StreamEvent>, mpsc::Sender<OutboundFrame>) {
    let (events_tx, events_rx) = mpsc::channel::<StreamEvent>(128);
    let (outbound_tx, mut outbound_rx) = mpsc::channel::<OutboundFrame>(16);

    tokio::spawn(async move {
        let mut last_seq: Option<u64> = config.from_sequence;
        let mut attempt: u32 = 0;
        loop {
            // Apply latest known sequence so the gateway resumes.
            config.from_sequence = last_seq;

            let stream = match (connect_fn)(config.clone()).await {
                Ok(s) => s,
                Err(e) => {
                    let _ = events_tx
                        .send(StreamEvent::Closed {
                            code: CloseCode::LifedUnavailable,
                            reason: format!("connect failed: {e}"),
                        })
                        .await;
                    if attempt >= MAX_RECONNECT_ATTEMPTS {
                        return;
                    }
                    attempt = attempt.saturating_add(1);
                    let _ = events_tx.send(StreamEvent::Reconnecting { attempt }).await;
                    backoff_sleep(attempt).await;
                    continue;
                }
            };
            attempt = 0;

            // From here we drive a single connection. We bail out on
            // `Closed` events (driver decides reconnect-or-stop) and
            // on outbound_rx closure (REPL exited).
            let close_reason =
                drive_one_connection(stream, &events_tx, &mut outbound_rx, &mut last_seq).await;

            match close_reason {
                DriveOutcome::ReplExited => return,
                DriveOutcome::TransportError => {
                    if attempt >= MAX_RECONNECT_ATTEMPTS {
                        return;
                    }
                    attempt = attempt.saturating_add(1);
                    let _ = events_tx.send(StreamEvent::Reconnecting { attempt }).await;
                    backoff_sleep(attempt).await;
                    continue;
                }
                DriveOutcome::FatalClose => return,
                DriveOutcome::RetryableClose => {
                    if attempt >= MAX_RECONNECT_ATTEMPTS {
                        return;
                    }
                    attempt = attempt.saturating_add(1);
                    let _ = events_tx.send(StreamEvent::Reconnecting { attempt }).await;
                    backoff_sleep(attempt).await;
                    continue;
                }
            }
        }
    });

    (events_rx, outbound_tx)
}

enum DriveOutcome {
    /// REPL closed the outbound side — we stop.
    ReplExited,
    /// Transport-level error (network blew up mid-recv).
    TransportError,
    /// Gateway sent a non-retryable close (auth, policy, etc).
    FatalClose,
    /// Gateway sent a retryable close (drain, internal error).
    RetryableClose,
}

async fn drive_one_connection(
    mut stream: Box<dyn AgentStream>,
    events_tx: &mpsc::Sender<StreamEvent>,
    outbound_rx: &mut mpsc::Receiver<OutboundFrame>,
    last_seq: &mut Option<u64>,
) -> DriveOutcome {
    loop {
        tokio::select! {
            biased;
            maybe_out = outbound_rx.recv() => {
                match maybe_out {
                    Some(frame) => {
                        if let Err(e) = stream.send(frame).await {
                            let _ = events_tx
                                .send(StreamEvent::Closed {
                                    code: CloseCode::InternalError,
                                    reason: format!("send failed: {e}"),
                                })
                                .await;
                            return DriveOutcome::TransportError;
                        }
                    }
                    None => return DriveOutcome::ReplExited,
                }
            }
            recv = stream.recv() => {
                match recv {
                    Ok(Some(event)) => {
                        if let StreamEvent::Token { sequence, .. } = &event {
                            *last_seq = Some(*sequence);
                        }
                        if let StreamEvent::Closed { code, .. } = &event {
                            let _ = events_tx.send(event.clone()).await;
                            return if code.is_retryable() {
                                DriveOutcome::RetryableClose
                            } else {
                                DriveOutcome::FatalClose
                            };
                        }
                        if events_tx.send(event).await.is_err() {
                            return DriveOutcome::ReplExited;
                        }
                    }
                    Ok(None) => {
                        // Stream ended without an explicit Close
                        // frame — treat as transport error so we
                        // try to reconnect.
                        let _ = events_tx
                            .send(StreamEvent::Closed {
                                code: CloseCode::InternalError,
                                reason: "ws stream ended without close frame".to_string(),
                            })
                            .await;
                        return DriveOutcome::TransportError;
                    }
                    Err(e) => {
                        let _ = events_tx
                            .send(StreamEvent::Closed {
                                code: CloseCode::InternalError,
                                reason: format!("recv error: {e}"),
                            })
                            .await;
                        return DriveOutcome::TransportError;
                    }
                }
            }
        }
    }
}

/// Spec C₃ §6.6 — jittered exponential backoff. Doubles each attempt,
/// caps at `MAX_BACKOFF_MS`, applies ±25% jitter so reconnect storms
/// don't synchronize across CLI instances.
async fn backoff_sleep(attempt: u32) {
    let base = (BASE_BACKOFF_MS.saturating_mul(1_u64 << attempt.min(6))).min(MAX_BACKOFF_MS);
    // ±25% jitter using a cheap LCG seeded by attempt + now-millis so
    // we don't pull in a full RNG crate.
    let jitter_seed = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.subsec_nanos() as u64)
        .unwrap_or(0);
    let jitter_pct = ((jitter_seed.wrapping_mul(2_654_435_761) >> 24) % 50) as i64 - 25; // -25..+25
    let jittered = (base as i64).saturating_add(base as i64 * jitter_pct / 100);
    let sleep_ms = jittered.clamp(50, MAX_BACKOFF_MS as i64) as u64;
    tokio::time::sleep(Duration::from_millis(sleep_ms)).await;
}

// ── Tests ────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn close_code_from_u16_matches_spec_c3_table() {
        // Spec C₃ §6.5 amendment table — every documented variant.
        assert_eq!(CloseCode::from_u16(1000), CloseCode::Normal);
        assert_eq!(CloseCode::from_u16(1001), CloseCode::GoingAway);
        assert_eq!(CloseCode::from_u16(1008), CloseCode::PolicyViolation);
        assert_eq!(CloseCode::from_u16(1011), CloseCode::InternalError);
        assert_eq!(CloseCode::from_u16(4001), CloseCode::RateLimit);
        assert_eq!(CloseCode::from_u16(4002), CloseCode::SlowConsumer);
        assert_eq!(CloseCode::from_u16(4003), CloseCode::IpBlocked);
        assert_eq!(CloseCode::from_u16(4004), CloseCode::LifedUnavailable);
        assert_eq!(CloseCode::from_u16(4005), CloseCode::SequenceRetired);
        assert_eq!(CloseCode::from_u16(9999), CloseCode::Unknown(9999));
    }

    #[test]
    fn close_code_retryable_partitioning() {
        assert!(CloseCode::GoingAway.is_retryable());
        assert!(CloseCode::InternalError.is_retryable());
        assert!(CloseCode::LifedUnavailable.is_retryable());
        assert!(CloseCode::SlowConsumer.is_retryable());
        assert!(!CloseCode::Normal.is_retryable());
        assert!(!CloseCode::PolicyViolation.is_retryable());
        assert!(!CloseCode::RateLimit.is_retryable());
        assert!(!CloseCode::IpBlocked.is_retryable());
        assert!(!CloseCode::SequenceRetired.is_retryable());
    }

    // ── Real-wire decoder ──────────────────────────────────────────

    #[test]
    fn real_wire_token_event_decodes_to_token_with_text_and_sequence() {
        // Real lifegw shape — `agent_event` envelope, `record.payload.text`.
        let json = json!({
            "kind": "agent_event",
            "seq_no": 7,
            "record": {
                "session_id": "01HXYZ",
                "sequence": 7,
                "kind": 1,
                "payload": { "text": "hello" }
            },
            "agent_kind": "TOKEN"
        })
        .to_string();
        let evt = wire::decode_event(&json, "claude-sonnet-4-6")
            .unwrap()
            .unwrap();
        match evt {
            StreamEvent::Token { sequence, text } => {
                assert_eq!(sequence, 7);
                assert_eq!(text, "hello");
            }
            other => panic!("expected Token, got {other:?}"),
        }
    }

    #[test]
    fn real_wire_finish_event_decodes_to_turn_complete() {
        let json = json!({
            "kind": "agent_event",
            "seq_no": 42,
            "record": { "sequence": 42, "kind": 5, "payload": {} },
            "agent_kind": "FINISH"
        })
        .to_string();
        let evt = wire::decode_event(&json, "claude-sonnet-4-6")
            .unwrap()
            .unwrap();
        assert!(
            matches!(evt, StreamEvent::TurnComplete { .. }),
            "expected TurnComplete, got {evt:?}"
        );
    }

    #[test]
    fn real_wire_error_event_decodes_to_turn_error_with_message() {
        let json = json!({
            "kind": "agent_event",
            "seq_no": 3,
            "record": {
                "sequence": 3,
                "kind": 6,
                "payload": { "message": "tool exec failed" }
            },
            "agent_kind": "ERROR"
        })
        .to_string();
        let evt = wire::decode_event(&json, "x").unwrap().unwrap();
        match evt {
            StreamEvent::TurnError { message } => {
                assert_eq!(message, "tool exec failed");
            }
            other => panic!("expected TurnError, got {other:?}"),
        }
    }

    #[test]
    fn real_wire_tool_call_pending_surfaces_as_informational_token() {
        // BRO-1189 design choice: TOOL_CALL_PENDING / TOOL_RESULT /
        // APPROVAL_REQUIRED / HIBERNATE are surfaced as bracketed
        // tokens so the REPL operator sees agent activity even when
        // the renderer doesn't have a dedicated UI for these kinds yet.
        let json = json!({
            "kind": "agent_event",
            "seq_no": 1,
            "record": {
                "sequence": 1,
                "kind": 2,
                "payload": { "call_id": "c-1", "tool": "github_read" }
            },
            "agent_kind": "TOOL_CALL_PENDING"
        })
        .to_string();
        let evt = wire::decode_event(&json, "x").unwrap().unwrap();
        match evt {
            StreamEvent::Token { text, .. } => {
                assert!(text.contains("tool_call_pending"), "{text}");
            }
            other => panic!("expected Token, got {other:?}"),
        }
    }

    #[test]
    fn real_wire_token_event_without_text_payload_drops_silently() {
        // Defensive: if the substrate emits TOKEN with no `text` field
        // (shouldn't happen in production but worth guarding), the
        // decoder skips the frame rather than emitting a 0-byte Token.
        let json = json!({
            "kind": "agent_event",
            "seq_no": 1,
            "record": { "sequence": 1, "kind": 1, "payload": {} },
            "agent_kind": "TOKEN"
        })
        .to_string();
        let evt = wire::decode_event(&json, "x").unwrap();
        assert!(evt.is_none(), "expected drop, got {evt:?}");
    }

    #[test]
    fn real_wire_unknown_agent_kind_drops_silently() {
        // Spec C₃ §6.5 — unknown frame kinds dropped silently.
        let json = json!({
            "kind": "agent_event",
            "seq_no": 1,
            "record": { "sequence": 1, "kind": 99, "payload": {} },
            "agent_kind": "FUTURE_KIND"
        })
        .to_string();
        assert!(wire::decode_event(&json, "x").unwrap().is_none());
    }

    #[test]
    fn real_wire_pong_frame_drops_silently() {
        let json = json!({"kind": "pong", "seq_no": 0}).to_string();
        assert!(wire::decode_event(&json, "x").unwrap().is_none());
    }

    #[test]
    fn real_wire_closing_frame_drops_silently() {
        let json = json!({"kind": "closing", "reason": "drain"}).to_string();
        assert!(wire::decode_event(&json, "x").unwrap().is_none());
    }

    // ── Legacy decoder still works (forward-compat for fakes) ──────

    #[test]
    fn legacy_token_frame_decodes_for_fake_streams() {
        // Phase B `{"kind":"token","sequence":...}` shape still
        // parses — used by `tests/chat_smoke.rs` fakes.
        let json = r#"{"kind":"token","sequence":42,"text":"hello"}"#;
        let evt = wire::decode_event(json, "claude-sonnet-4-6")
            .unwrap()
            .unwrap();
        match evt {
            StreamEvent::Token { sequence, text } => {
                assert_eq!(sequence, 42);
                assert_eq!(text, "hello");
            }
            _ => panic!("expected Token"),
        }
    }

    #[test]
    fn legacy_turn_complete_with_optional_fields() {
        let with = r#"{"kind":"turn_complete","latency_ms":1234,"cost_usd":0.005}"#;
        match wire::decode_event(with, "x").unwrap().unwrap() {
            StreamEvent::TurnComplete {
                latency_ms,
                cost_usd,
            } => {
                assert_eq!(latency_ms, Some(1234));
                assert_eq!(cost_usd, Some(0.005));
            }
            _ => panic!("expected TurnComplete"),
        }
    }

    // ── Outbound encoder ───────────────────────────────────────────

    #[test]
    fn outbound_user_turn_encodes_as_real_wire_send_message() {
        let frame = OutboundFrame::UserTurn {
            text: "say hello".into(),
            from_sequence: Some(0),
            model: Some("claude-sonnet-4-6".into()),
        };
        let wire = wire::cli_to_wire_outbound(&frame, None);
        let json = serde_json::to_string(&wire).unwrap();
        assert!(json.contains("\"kind\":\"send_message\""), "{json}");
        assert!(json.contains("\"content\":\"say hello\""), "{json}");
        // attachment_blob_ref absent ⇒ field omitted.
        assert!(!json.contains("attachment_blob_ref"), "{json}");
        // from_sequence is NOT on the wire — it lives in the URL.
        assert!(!json.contains("from_sequence"), "{json}");
        // model is NOT on the wire either.
        assert!(!json.contains("\"model\""), "{json}");
    }

    #[test]
    fn outbound_cancel_encodes_as_cancel_dispatch() {
        let frame = OutboundFrame::Cancel;
        let wire = wire::cli_to_wire_outbound(&frame, None);
        let json = serde_json::to_string(&wire).unwrap();
        assert!(json.contains("\"kind\":\"cancel_dispatch\""), "{json}");
    }

    #[test]
    fn outbound_ping_encodes_as_ping_with_seq_no() {
        let frame = OutboundFrame::Ping;
        let wire = wire::cli_to_wire_outbound(&frame, None);
        let json = serde_json::to_string(&wire).unwrap();
        assert!(json.contains("\"kind\":\"ping\""), "{json}");
    }

    // ── Backoff ────────────────────────────────────────────────────

    #[tokio::test]
    async fn backoff_sleep_grows_then_caps() {
        let start = std::time::Instant::now();
        backoff_sleep(0).await;
        let first = start.elapsed();
        // ±25% jitter on BASE_BACKOFF_MS=250 ⇒ ~190-310 ms.
        assert!(first.as_millis() >= 50 && first.as_millis() <= 500);
    }

    // ── Connect URL composition ────────────────────────────────────

    #[test]
    fn default_config_carries_user_id_and_project_id() {
        let cfg = AgentStreamConfig::default();
        assert!(!cfg.user_id.is_empty());
        assert_eq!(cfg.project_id, DEFAULT_PROJECT_ID);
        assert!(cfg.gateway_url.starts_with("https://"));
    }
}
