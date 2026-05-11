//! Telemetry beacon — fires a `POST /api/invocations` request before the
//! actual prompt operation. Always best-effort: failures get a single
//! stderr warning, never propagate.

use crate::api::BroomvaClient;
use crate::api::types::InvocationCreateRequest;
use crate::telemetry::session::get_or_create_session_id;
use crate::telemetry::source::{caller_string, detect_source, telemetry_disabled};

/// Result of a beacon attempt. The `id` field is always populated (even
/// when telemetry is disabled or the POST fails) so callers downstream
/// can emit a machine-readable line, but `posted == false` signals the
/// row may not actually exist in the server.
pub struct BeaconResult {
    pub id: String,
    // Retained for downstream consumers (Claude Code skill, JSON output);
    // currently informational on the struct itself.
    #[allow(dead_code)]
    pub prompt_slug: String,
    #[allow(dead_code)]
    pub prompt_version: String,
    pub posted: bool,
}

/// Fire a telemetry beacon for a prompt operation. Returns immediately
/// with `posted == false` if telemetry is disabled. Generates a fresh
/// UUID v4 client-side so the caller can use it before round-tripping
/// (e.g. to emit on stderr in machine-readable mode).
pub async fn post_invocation_beacon(
    client: &BroomvaClient,
    prompt_slug: &str,
    prompt_version: &str,
) -> BeaconResult {
    let id = uuid::Uuid::new_v4().to_string();

    if telemetry_disabled() {
        return BeaconResult {
            id,
            prompt_slug: prompt_slug.to_string(),
            prompt_version: prompt_version.to_string(),
            posted: false,
        };
    }

    let source = detect_source();
    let session_id = get_or_create_session_id();

    let req = InvocationCreateRequest {
        id: Some(id.clone()),
        prompt_slug: prompt_slug.to_string(),
        prompt_version: prompt_version.to_string(),
        source: source.as_str().to_string(),
        caller: Some(caller_string()),
        session_id: Some(session_id),
        variables: None,
        metadata: None,
    };

    match client.create_invocation(&req).await {
        Ok(_) => BeaconResult {
            id,
            prompt_slug: prompt_slug.to_string(),
            prompt_version: prompt_version.to_string(),
            posted: true,
        },
        Err(err) => {
            eprintln!("[broomva] telemetry write failed: {err}");
            BeaconResult {
                id,
                prompt_slug: prompt_slug.to_string(),
                prompt_version: prompt_version.to_string(),
                posted: false,
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::telemetry::TELEMETRY_ENV_LOCK;
    use tempfile::tempdir;
    use wiremock::matchers::{method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    /// RAII guard restoring an env var on drop — keeps tests hermetic
    /// even when an assertion panics mid-test.
    struct EnvGuard {
        key: &'static str,
        prev: Option<String>,
    }

    impl EnvGuard {
        fn set(key: &'static str, value: &str) -> Self {
            let prev = std::env::var(key).ok();
            unsafe { std::env::set_var(key, value) };
            Self { key, prev }
        }
    }

    impl Drop for EnvGuard {
        fn drop(&mut self) {
            match &self.prev {
                Some(v) => unsafe { std::env::set_var(self.key, v) },
                None => unsafe { std::env::remove_var(self.key) },
            }
        }
    }

    #[tokio::test]
    #[allow(clippy::await_holding_lock)]
    async fn beacon_returns_posted_true_on_success() {
        // Holding a std Mutex across awaits is fine in this test:
        // tokio::test defaults to a single-threaded runtime, so the
        // guard cannot block another thread for the test duration.
        let _guard = TELEMETRY_ENV_LOCK.lock().unwrap();

        // Hermeticity: point the session cache at a tempdir so the test
        // doesn't write into the developer's real ~/.broomva/session.
        let session_tmp = tempdir().unwrap();
        let session_path = session_tmp.path().join("session");
        let _session_guard = EnvGuard::set(
            "BROOMVA_SESSION_PATH",
            &session_path.to_string_lossy(),
        );

        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/api/invocations"))
            .respond_with(ResponseTemplate::new(201).set_body_json(serde_json::json!({
                "id": "anything",
                "created_at": "2026-05-11T00:00:00Z"
            })))
            .mount(&server)
            .await;

        let client = BroomvaClient::new(server.uri(), None);
        let result = post_invocation_beacon(&client, "x", "1.0").await;
        assert!(result.posted);
        assert!(uuid::Uuid::parse_str(&result.id).is_ok());
        assert_eq!(result.prompt_slug, "x");
    }

    #[tokio::test]
    #[allow(clippy::await_holding_lock)]
    async fn beacon_returns_posted_false_on_429() {
        let _guard = TELEMETRY_ENV_LOCK.lock().unwrap();

        let session_tmp = tempdir().unwrap();
        let session_path = session_tmp.path().join("session");
        let _session_guard = EnvGuard::set(
            "BROOMVA_SESSION_PATH",
            &session_path.to_string_lossy(),
        );

        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/api/invocations"))
            .respond_with(ResponseTemplate::new(429))
            .mount(&server)
            .await;

        let client = BroomvaClient::new(server.uri(), None);
        let result = post_invocation_beacon(&client, "x", "1.0").await;
        assert!(!result.posted);
        assert!(uuid::Uuid::parse_str(&result.id).is_ok());
    }
}
