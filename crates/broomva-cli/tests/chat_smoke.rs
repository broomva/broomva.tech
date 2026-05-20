//! Smoke test for `broomva chat` — verifies the REPL state machine
//! against a fake `AgentStream` transport.
//!
//! Why a fake-stream test (vs a real WebSocket fixture):
//!
//! - The `AgentStream` trait is the seam between the REPL and the
//!   gateway transport. Faking it covers the same code path the
//!   production code uses (`ChatSession::send_turn` →
//!   `ChatSession::drain_until_turn_end`) without requiring a real
//!   WebSocket upgrade. `wiremock` is the rest of the dev-deps story
//!   and explicitly does not support WebSocket — see
//!   <https://github.com/LukeMathWalker/wiremock-rs/issues/156>.
//! - The smoke test exercises: connect → user turn → stream tokens
//!   (with live `last_seq` updates) → turn complete → history persisted.
//!   It is intentionally not a SLO benchmark; live perf is gated
//!   behind `BROOMVA_LIVE_INTEGRATION=1` (spec §7.2).

// `await_holding_lock`: the `ENV_LOCK` guard is intentionally held
// across `.await` so concurrent smoke tests serialize their
// `BROOMVA_SESSIONS_DIR` env mutations. The tokio runtime in each
// test is single-threaded (`#[tokio::test]` default), so the
// held-lock-across-await pattern doesn't cause deadlock — it's the
// same shape used by std-Mutex + tokio tests across the rust
// ecosystem (e.g. tokio-rs/tokio README examples).
#![allow(clippy::await_holding_lock)]

use std::sync::Mutex;

use broomva::api::agent_stream::{AgentStream, CloseCode, OutboundFrame, StreamEvent};
use broomva::cli::chat::{ChatRunOpts, ChatSession, HistoryEntry, HistoryRole, load_history};
use broomva::error::BroomvaResult;
use broomva::tui::CapturedRenderer;

/// Process-wide lock so smoke tests that mutate `BROOMVA_SESSIONS_DIR`
/// don't race each other. `cargo test` runs tests on a thread pool by
/// default; sharing one env var across threads ⇒ serialize the section
/// that touches it.
static ENV_LOCK: Mutex<()> = Mutex::new(());

/// FakeStream — a preloaded queue of events the recv side hands out
/// in order, plus a Vec capturing whatever the REPL `send`s.
///
/// Concurrent access via `Mutex` because the underlying trait takes
/// `&mut self` for both sides but the production driver uses
/// `tokio::select`. For Phase A the REPL is sequential (send turn
/// → drain) so a single mutex suffices.
struct FakeStream {
    /// Events served by `recv` in order. Once empty, `recv` returns
    /// `Ok(Some(StreamEvent::Closed{ Normal, "drained" }))` once,
    /// then `Ok(None)` thereafter.
    inbound: Mutex<Vec<StreamEvent>>,
    /// Frames captured from `send` for inspection by the test.
    pub captured: Mutex<Vec<OutboundFrame>>,
    /// True once `close()` was called.
    pub closed: Mutex<bool>,
}

impl FakeStream {
    fn with_events(events: Vec<StreamEvent>) -> Self {
        Self {
            inbound: Mutex::new(events),
            captured: Mutex::new(Vec::new()),
            closed: Mutex::new(false),
        }
    }

    fn captured(&self) -> Vec<OutboundFrame> {
        self.captured.lock().unwrap().clone()
    }
}

#[async_trait::async_trait]
impl AgentStream for FakeStream {
    async fn send(&mut self, frame: OutboundFrame) -> BroomvaResult<()> {
        self.captured.lock().unwrap().push(frame);
        Ok(())
    }
    async fn recv(&mut self) -> BroomvaResult<Option<StreamEvent>> {
        let mut q = self.inbound.lock().unwrap();
        if q.is_empty() {
            return Ok(None);
        }
        Ok(Some(q.remove(0)))
    }
    async fn close(self: Box<Self>) -> BroomvaResult<()> {
        *self.closed.lock().unwrap() = true;
        Ok(())
    }
}

/// Build a `ChatSession` rooted at a temp dir so the test doesn't
/// touch the user's real `~/.broomva/sessions/`. Holds the env lock
/// for the entire test body via the returned guard.
fn isolated_session(
    tmp: &tempfile::TempDir,
    session_id: Option<String>,
) -> (ChatSession, std::sync::MutexGuard<'static, ()>) {
    let guard = ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    // BROOMVA_SESSIONS_DIR is the documented override for tests +
    // sandboxed callers — see `sessions_dir()` in cli/chat.rs.
    // SAFETY: the env lock above serializes mutations across the
    // process so this is the only writer.
    unsafe {
        std::env::set_var("BROOMVA_SESSIONS_DIR", tmp.path());
    }
    let opts = ChatRunOpts {
        prompt: None,
        session_id: session_id.clone(),
        model: Some("claude-sonnet-4-6".into()),
        gateway_url: Some("ws://localhost:1".into()),
        token_override: Some("test-token".into()),
        ca_cert_path: None,
    };
    let session = ChatSession::new(opts, session_id)
        .expect("ChatSession::new should succeed in isolated tmp dir");
    let renderer: Box<dyn broomva::tui::Renderer> = Box::new(CapturedRenderer::default());
    (session.with_renderer(renderer), guard)
}

#[tokio::test]
async fn one_shot_streams_tokens_persists_history_and_closes() {
    let tmp = tempfile::tempdir().unwrap();
    let session_id = "abcdef1234567890".to_string();
    let (mut session, _guard) = isolated_session(&tmp, Some(session_id.clone()));

    // Preload the fake stream: gateway opens session → 3 tokens → done.
    let mut fake = Box::new(FakeStream::with_events(vec![
        StreamEvent::Opened {
            session_id: session_id.clone(),
            model: "claude-sonnet-4-6".to_string(),
        },
        StreamEvent::Token {
            text: "hello".into(),
            sequence: 0,
        },
        StreamEvent::Token {
            text: " ".into(),
            sequence: 1,
        },
        StreamEvent::Token {
            text: "world".into(),
            sequence: 2,
        },
        StreamEvent::TurnComplete {
            latency_ms: Some(500),
            cost_usd: Some(0.001),
        },
    ]));

    // Send a user turn — this should also append a User HistoryEntry.
    session
        .send_turn(&mut *fake, "say hello")
        .await
        .expect("send_turn should succeed");

    // Drain the gateway events — should render 3 tokens + persist
    // assistant entry.
    session
        .drain_until_turn_end(&mut *fake)
        .await
        .expect("drain_until_turn_end should succeed");

    // 1. Captured outbound contains exactly one UserTurn frame.
    let captured = fake.captured();
    assert_eq!(captured.len(), 1, "expected exactly one outbound frame");
    match &captured[0] {
        OutboundFrame::UserTurn { text, model, .. } => {
            assert_eq!(text, "say hello");
            assert_eq!(model.as_deref(), Some("claude-sonnet-4-6"));
        }
        other => panic!("expected UserTurn, got {other:?}"),
    }

    // 2. History on disk: 1 user entry + 1 assistant entry.
    let history = load_history(&session_id).expect("history should load");
    assert_eq!(history.len(), 2, "expected user + assistant entries");
    assert_eq!(history[0].role, HistoryRole::User);
    assert_eq!(history[0].content, "say hello");
    assert_eq!(history[0].seq, 0);
    assert_eq!(history[1].role, HistoryRole::Assistant);
    assert_eq!(history[1].content, "hello world");
    // Assistant seq is last_seq + 1 = 2 + 1 = 3.
    assert_eq!(history[1].seq, 3);

    // 3. Close was NOT called by drain (the REPL closes the stream
    // after drain returns). Sanity-check our fake.
    assert!(!*fake.closed.lock().unwrap());
}

#[tokio::test]
async fn drain_handles_close_frame_with_retryable_code_then_exits() {
    let tmp = tempfile::tempdir().unwrap();
    let session_id = "1111222233334444".to_string();
    let (mut session, _guard) = isolated_session(&tmp, Some(session_id.clone()));

    let mut fake = Box::new(FakeStream::with_events(vec![
        StreamEvent::Token {
            text: "partial".into(),
            sequence: 5,
        },
        StreamEvent::Closed {
            code: CloseCode::InternalError,
            reason: "deadline-exceeded".to_string(),
        },
    ]));

    session
        .send_turn(&mut *fake, "trigger")
        .await
        .expect("send_turn");
    session
        .drain_until_turn_end(&mut *fake)
        .await
        .expect("drain should not error on Closed");

    // Even though the gateway closed mid-turn, the user message should
    // have been persisted; no assistant entry because TurnComplete
    // never arrived (matches our "only persist on TurnComplete" rule).
    let history = load_history(&session_id).expect("history should load");
    assert_eq!(history.len(), 1, "expected only the user entry");
    assert_eq!(history[0].role, HistoryRole::User);
}

#[tokio::test]
async fn drain_handles_turn_error_persists_partial_and_continues() {
    let tmp = tempfile::tempdir().unwrap();
    let session_id = "ffeeffeeffeeffee".to_string();
    let (mut session, _guard) = isolated_session(&tmp, Some(session_id.clone()));

    let mut fake = Box::new(FakeStream::with_events(vec![
        StreamEvent::Token {
            text: "thinking".into(),
            sequence: 0,
        },
        StreamEvent::TurnError {
            message: "tool exec failed".into(),
        },
    ]));

    session.send_turn(&mut *fake, "use tool").await.unwrap();
    session.drain_until_turn_end(&mut *fake).await.unwrap();

    let history = load_history(&session_id).unwrap();
    // user + partial assistant + system error
    assert_eq!(
        history.len(),
        3,
        "expected user + partial-assistant + system"
    );
    assert_eq!(history[0].role, HistoryRole::User);
    assert_eq!(history[1].role, HistoryRole::Assistant);
    assert_eq!(history[1].content, "thinking");
    assert_eq!(history[2].role, HistoryRole::System);
    assert!(history[2].content.contains("turn_error"));
}

#[tokio::test]
async fn resume_replays_history_and_reconnects_with_from_sequence() {
    let tmp = tempfile::tempdir().unwrap();
    let session_id = "deadbeefdeadbeef".to_string();

    // Take the env lock once for the entire test body, so the prior
    // seed + resume both observe the same BROOMVA_SESSIONS_DIR.
    let _guard = ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    // SAFETY: lock is held for the test body.
    unsafe {
        std::env::set_var("BROOMVA_SESSIONS_DIR", tmp.path());
    }

    let opts = ChatRunOpts {
        prompt: None,
        session_id: Some(session_id.clone()),
        model: Some("claude-sonnet-4-6".into()),
        gateway_url: Some("ws://localhost:1".into()),
        token_override: Some("test-token".into()),
        ca_cert_path: None,
    };

    // Pre-seed the history file as if a prior session left state.
    {
        let mut session = ChatSession::new(opts.clone(), Some(session_id.clone()))
            .unwrap()
            .with_renderer(Box::new(CapturedRenderer::default()));
        let mut fake = Box::new(FakeStream::with_events(vec![
            StreamEvent::Token {
                text: "prior reply".into(),
                sequence: 0,
            },
            StreamEvent::TurnComplete {
                latency_ms: None,
                cost_usd: None,
            },
        ]));
        session.send_turn(&mut *fake, "prior turn").await.unwrap();
        session.drain_until_turn_end(&mut *fake).await.unwrap();
    }
    // Sanity — history was written.
    let prior = load_history(&session_id).unwrap();
    assert_eq!(prior.len(), 2);

    // Resume: build a fresh session, prime it with the resume-seq,
    // ensure the next outbound carries `from_sequence`.
    let mut session = ChatSession::new(opts, Some(session_id.clone()))
        .unwrap()
        .with_renderer(Box::new(CapturedRenderer::default()));
    session.set_resume_sequence(prior.iter().map(|e| e.seq).max());
    let mut fake = Box::new(FakeStream::with_events(vec![
        StreamEvent::Token {
            text: "continuation".into(),
            sequence: 10,
        },
        StreamEvent::TurnComplete {
            latency_ms: None,
            cost_usd: None,
        },
    ]));
    session.send_turn(&mut *fake, "resume turn").await.unwrap();

    let captured = fake.captured();
    match &captured[0] {
        OutboundFrame::UserTurn { from_sequence, .. } => {
            assert_eq!(
                *from_sequence,
                Some(1),
                "resume should pass last_seq from prior history"
            );
        }
        other => panic!("expected UserTurn, got {other:?}"),
    }

    session.drain_until_turn_end(&mut *fake).await.unwrap();
    let after = load_history(&session_id).unwrap();
    // Prior 2 + new user + new assistant = 4 total.
    assert_eq!(after.len(), 4);
}

#[tokio::test]
async fn fake_stream_recv_returns_none_when_drained() {
    // Spec contract: AgentStream::recv returns Ok(None) on graceful
    // exhaustion. The drain loop must handle this without panicking.
    let mut fake = Box::new(FakeStream::with_events(vec![]));
    let evt = fake.recv().await.unwrap();
    assert!(evt.is_none());
}

#[test]
fn history_entry_round_trips_with_optional_model_missing() {
    // Forward-compat: history files written by a Phase-B-or-later
    // build that adds `cost_usd` should still be readable by Phase A.
    let entry = HistoryEntry {
        role: HistoryRole::User,
        content: "x".into(),
        ts: chrono::Utc::now(),
        model: None,
        session_id: "s".into(),
        seq: 0,
    };
    let line = serde_json::to_string(&entry).unwrap();
    let parsed: HistoryEntry = serde_json::from_str(&line).unwrap();
    assert_eq!(parsed.role, HistoryRole::User);
    assert!(parsed.model.is_none());
}
