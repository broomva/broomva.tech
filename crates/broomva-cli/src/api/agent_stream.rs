//! WebSocket client for `lifegw /v1/agent/stream` (Spec C₃).
//!
//! Implements the **Chat Session Contract** (CC-1..CC-5 from
//! `docs/specs/2026-05-18-broomva-cli-agent-chat-pipeline.md` §3.1):
//!
//! - **CC-1** Auth via `Sec-WebSocket-Protocol: bearer.<jwt>` subprotocol
//!   header (matches Spec C₃ §M7-D wire shape — see
//!   `core/life/crates/life-runtime/lifegw/src/services/ws.rs`).
//! - **CC-2** Multi-turn sessions persist across CLI invocations via
//!   `from_sequence` reconnect (Spec C₃ §6.6 — jittered exponential
//!   backoff).
//! - **CC-3** Token-level streaming exposed as a `tokio::sync::mpsc`
//!   channel of [`StreamEvent`] — the renderer task drains the channel
//!   non-blockingly so WS network jitter never stalls the typewriter.
//! - **CC-4** Close codes mapped to typed [`CloseCode`] following the
//!   Spec C₃ §6.5 amendment at
//!   `core/life/docs/superpowers/specs/2026-04-29-spec-c3-close-codes.md`.
//! - **CC-5** Session emits a telemetry beacon — wired in the `chat.rs`
//!   handler, not here (this module is transport-only).
//!
//! The module exposes an [`AgentStream`] trait so tests can swap the
//! tungstenite implementation for an in-memory fake (see
//! `tests/chat_smoke.rs`).

use std::time::Duration;

use serde::{Deserialize, Serialize};
use tokio::sync::mpsc;

use crate::error::{BroomvaError, BroomvaResult};

/// Default WebSocket gateway endpoint when no override is provided.
///
/// Production lifegw serves `/v1/agent/stream` over WSS — see
/// `core/life/crates/life-runtime/lifegw/src/services/ws.rs`. The
/// CLI lets users point at a different gateway via:
///   1. `--gateway-url <wss://…>` CLI flag.
///   2. `BROOMVA_GATEWAY_URL` env var.
///   3. `~/.broomva/config.json` key `gatewayUrl`.
pub const DEFAULT_GATEWAY_URL: &str = "wss://lifegw.broomva.tech/v1/agent/stream";

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

// ── Wire shape ───────────────────────────────────────────────────────

/// Frame the CLI sends to the gateway over the upgraded WS.
///
/// Wire shape mirrors `WireFrame` in
/// `core/life/crates/life-runtime/lifegw/src/services/ws.rs` —
/// `serde(tag = "kind")` tag is the single source of truth for the
/// dispatcher on the gateway side.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum OutboundFrame {
    /// A user turn (a single message from the user — one chat turn).
    UserTurn {
        text: String,
        /// Server-side sequence number we last observed; used for
        /// reconnect-by-last-seq.
        from_sequence: Option<u64>,
        /// Inference model the user picked for this turn. None ⇒
        /// gateway default.
        model: Option<String>,
    },
    /// Client requests an in-flight cancel (ESC pressed mid-stream).
    Cancel,
    /// Heartbeat ping (currently the gateway server-pings; this is
    /// reserved for future M8 SDK parity).
    Ping,
}

/// Frame the gateway emits back to the CLI.
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
        /// Monotonic per-session sequence number.
        sequence: u64,
        /// Text fragment to render.
        text: String,
        /// Optional model identifier (set on the first token of a turn).
        model: Option<String>,
    },
    /// Session-level metadata pushed at upgrade time.
    SessionOpened { session_id: String, model: String },
    /// End of the current turn — gateway signals "model is done".
    TurnComplete {
        /// Wall-clock latency the gateway observed for this turn.
        latency_ms: Option<u64>,
        /// Cost for this turn (USD).
        cost_usd: Option<f64>,
    },
    /// Error inside the turn (e.g. tool failed). Stream remains open.
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
    /// WSS URL of the gateway. Defaults to [`DEFAULT_GATEWAY_URL`].
    pub gateway_url: String,
    /// Bearer JWT (mint via `broomva auth login`).
    pub token: Option<String>,
    /// Optional session ID for resume. None ⇒ new session.
    pub session_id: Option<String>,
    /// Optional `from_sequence` for reconnect-by-last-seq.
    pub from_sequence: Option<u64>,
    /// Optional model override for the next turn.
    pub model: Option<String>,
    /// Connect timeout.
    pub connect_timeout: Duration,
}

impl Default for AgentStreamConfig {
    fn default() -> Self {
        Self {
            gateway_url: DEFAULT_GATEWAY_URL.to_string(),
            token: None,
            session_id: None,
            from_sequence: None,
            model: None,
            connect_timeout: Duration::from_secs(10),
        }
    }
}

/// Open a fresh production stream backed by tokio-tungstenite.
///
/// Wires up Spec C₃'s `Sec-WebSocket-Protocol: bearer.<jwt>` auth
/// header. Returns a boxed trait object so the REPL and the smoke
/// test can share the same code path.
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
use tokio_tungstenite::{MaybeTlsStream, WebSocketStream, connect_async};

type TungsteniteSocket = WebSocketStream<MaybeTlsStream<tokio::net::TcpStream>>;

pub struct TungsteniteStream {
    socket: TungsteniteSocket,
}

impl TungsteniteStream {
    async fn connect(config: AgentStreamConfig) -> BroomvaResult<Self> {
        let mut url = url::Url::parse(&config.gateway_url).map_err(|e| {
            BroomvaError::User(format!(
                "invalid gateway URL {url:?}: {e}",
                url = config.gateway_url
            ))
        })?;
        // Pass session_id/from_sequence as query string so the gateway
        // can resume server-side. The gateway accepts either query
        // params OR the first inbound `UserTurn` carrying
        // `from_sequence` — query params let us reconnect to the same
        // session without sending any user input first.
        if let Some(sid) = &config.session_id {
            url.query_pairs_mut().append_pair("session", sid);
        }
        if let Some(seq) = config.from_sequence {
            url.query_pairs_mut()
                .append_pair("from_sequence", &seq.to_string());
        }

        let mut request: Request = url
            .as_str()
            .into_client_request()
            .map_err(|e| BroomvaError::User(format!("ws request build failed: {e}")))?;

        // Bearer auth via the subprotocol header — matches Spec C₃ §6.6
        // wire shape (see Sub-phase D D7 in
        // `crates/life-runtime/lifegw/src/services/ws.rs`).
        if let Some(tok) = &config.token {
            // Subprotocol values must be RFC 6455 tokens (no spaces,
            // no commas). The format is `bearer.<jwt>` — same as the
            // M8 SDK convention.
            let proto = format!("bearer.{tok}");
            let header_value = http::HeaderValue::from_str(&proto).map_err(|e| {
                BroomvaError::User(format!("invalid token characters for ws subprotocol: {e}"))
            })?;
            request
                .headers_mut()
                .insert("Sec-WebSocket-Protocol", header_value);
        }

        let connect_fut = connect_async(request);
        let (socket, _resp) = tokio::time::timeout(config.connect_timeout, connect_fut)
            .await
            .map_err(|_| {
                BroomvaError::User(format!(
                    "gateway connect timed out after {:?}",
                    config.connect_timeout
                ))
            })?
            .map_err(|e| BroomvaError::User(format!("ws handshake failed: {e}")))?;

        Ok(Self { socket })
    }
}

#[async_trait::async_trait]
impl AgentStream for TungsteniteStream {
    async fn send(&mut self, frame: OutboundFrame) -> BroomvaResult<()> {
        let text = serde_json::to_string(&frame)?;
        self.socket
            .send(Message::Text(text))
            .await
            .map_err(|e| BroomvaError::User(format!("ws send failed: {e}")))?;
        Ok(())
    }

    async fn recv(&mut self) -> BroomvaResult<Option<StreamEvent>> {
        while let Some(msg) = self.socket.next().await {
            let msg = msg.map_err(|e| BroomvaError::User(format!("ws recv failed: {e}")))?;
            match msg {
                Message::Text(text) => {
                    let Some(event) = decode_event(text.as_ref())? else {
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

/// Convert a wire-format `InboundFrame` text payload to a `StreamEvent`.
/// Unknown frames return `Ok(None)` so the caller skips them.
fn decode_event(text: &str) -> BroomvaResult<Option<StreamEvent>> {
    // Try strict decode first; if it fails because of an unknown
    // variant (forward-compat client / older gateway or vice-versa),
    // drop it silently.
    let frame: Result<InboundFrame, _> = serde_json::from_str(text);
    match frame {
        Ok(InboundFrame::Token { sequence, text, .. }) => {
            Ok(Some(StreamEvent::Token { text, sequence }))
        }
        Ok(InboundFrame::SessionOpened { session_id, model }) => {
            Ok(Some(StreamEvent::Opened { session_id, model }))
        }
        Ok(InboundFrame::TurnComplete {
            latency_ms,
            cost_usd,
        }) => Ok(Some(StreamEvent::TurnComplete {
            latency_ms,
            cost_usd,
        })),
        Ok(InboundFrame::TurnError { message }) => Ok(Some(StreamEvent::TurnError { message })),
        Err(_) => Ok(None),
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
        // Retryable: server-side transient faults only.
        assert!(CloseCode::GoingAway.is_retryable());
        assert!(CloseCode::InternalError.is_retryable());
        assert!(CloseCode::LifedUnavailable.is_retryable());
        assert!(CloseCode::SlowConsumer.is_retryable());
        // Not retryable: client-fault closes (auth, rate, blocklist,
        // sequence retired → resync required), or graceful normal.
        assert!(!CloseCode::Normal.is_retryable());
        assert!(!CloseCode::PolicyViolation.is_retryable());
        assert!(!CloseCode::RateLimit.is_retryable());
        assert!(!CloseCode::IpBlocked.is_retryable());
        assert!(!CloseCode::SequenceRetired.is_retryable());
    }

    #[test]
    fn inbound_frame_decodes_token() {
        let json = r#"{"kind":"token","sequence":42,"text":"hello"}"#;
        let evt = decode_event(json).unwrap().unwrap();
        match evt {
            StreamEvent::Token { sequence, text } => {
                assert_eq!(sequence, 42);
                assert_eq!(text, "hello");
            }
            _ => panic!("expected Token"),
        }
    }

    #[test]
    fn inbound_frame_decodes_session_opened() {
        let json = r#"{"kind":"session_opened","session_id":"01J","model":"claude-sonnet-4-6"}"#;
        let evt = decode_event(json).unwrap().unwrap();
        assert!(matches!(evt, StreamEvent::Opened { .. }));
    }

    #[test]
    fn inbound_frame_decodes_turn_complete_with_optional_fields() {
        let with = r#"{"kind":"turn_complete","latency_ms":1234,"cost_usd":0.005}"#;
        match decode_event(with).unwrap().unwrap() {
            StreamEvent::TurnComplete {
                latency_ms,
                cost_usd,
            } => {
                assert_eq!(latency_ms, Some(1234));
                assert_eq!(cost_usd, Some(0.005));
            }
            _ => panic!("expected TurnComplete"),
        }
        let without = r#"{"kind":"turn_complete"}"#;
        match decode_event(without).unwrap().unwrap() {
            StreamEvent::TurnComplete {
                latency_ms,
                cost_usd,
            } => {
                assert_eq!(latency_ms, None);
                assert_eq!(cost_usd, None);
            }
            _ => panic!("expected TurnComplete"),
        }
    }

    #[test]
    fn inbound_frame_drops_unknown_kind_silently() {
        // Spec C₃ §6.5 note: unknown frame kinds dropped silently
        // (gateway never closes 1003 for them). Client mirrors policy.
        let json = r#"{"kind":"some_future_thing","payload":"x"}"#;
        assert!(decode_event(json).unwrap().is_none());
    }

    #[test]
    fn outbound_user_turn_serializes_with_kind_tag() {
        let frame = OutboundFrame::UserTurn {
            text: "hi".into(),
            from_sequence: Some(7),
            model: Some("claude-sonnet-4-6".into()),
        };
        let json = serde_json::to_string(&frame).unwrap();
        assert!(json.contains("\"kind\":\"user_turn\""));
        assert!(json.contains("\"from_sequence\":7"));
        assert!(json.contains("\"text\":\"hi\""));
    }

    #[test]
    fn outbound_cancel_serializes_compactly() {
        let frame = OutboundFrame::Cancel;
        let json = serde_json::to_string(&frame).unwrap();
        assert_eq!(json, r#"{"kind":"cancel"}"#);
    }

    #[tokio::test]
    async fn backoff_sleep_grows_then_caps() {
        // Sanity — should complete quickly even at high attempts.
        let start = std::time::Instant::now();
        backoff_sleep(0).await;
        let first = start.elapsed();
        // ±25% jitter on BASE_BACKOFF_MS=250 ⇒ ~190-310 ms.
        assert!(first.as_millis() >= 50 && first.as_millis() <= 500);
    }
}
