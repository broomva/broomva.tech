//! Transparent Tier-1 refresh — silently re-mint the ES256 lifegw JWT
//! from the long-lived Better Auth HS256 access token before it
//! expires.
//!
//! ## Context (BRO-1224)
//!
//! Production lifegw Tier-1 JWTs have a 15 min TTL (Spec C₃ §5.4). Without
//! transparent refresh, every `broomva chat` after expiry fails with 401
//! and forces the user back through the interactive device-code flow.
//!
//! The Better Auth session (`config.token`, HS256, 24h TTL per
//! `JWT_ACCESS_EXPIRY`) is the natural refresh credential. The
//! server-side endpoint `POST /api/auth/lifegw-token` (shipped in this
//! PR) takes the HS256 token as Bearer auth and returns a fresh Tier-1
//! ES256 JWT.
//!
//! ## Refresh layering
//!
//! ```text
//! Better Auth session (HS256, 24h)
//!    ↓ POST /api/auth/lifegw-token  (this module's caller)
//! Tier-1 lifegw JWT (ES256, 15 min)
//!    ↓ Authorization header to lifegw
//! Tier-2 substrate JWT (lifegw → lifed, internal)
//! ```
//!
//! Each layer's TTL is calibrated to its blast radius. If the HS256
//! itself is dead (`refresh_lifegw_token` returns `AuthRequired`), the
//! caller must escalate to interactive `broomva auth login`.
//!
//! ## Single-flight
//!
//! Not implemented — CLI is single-process. The filesystem (via
//! `update_config`) is the source of truth; two parallel `broomva chat`
//! invocations would both refresh independently. That's wasteful but
//! correct (no token corruption).

use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::Deserialize;

use crate::config::{self, store_lifegw_token};
use crate::error::{BroomvaError, BroomvaResult};

/// Default safety margin — refresh when the token is less than this
/// many seconds from expiry. 60s gives the refresh request enough
/// budget to complete before any downstream request would 401, even on
/// slow networks.
pub const DEFAULT_REFRESH_THRESHOLD_SECS: u64 = 60;

/// Server-side response shape for `POST /api/auth/lifegw-token`. Keys
/// mirror the CLI's `CliConfig.lifegw_token{,_expires_at}` fields so
/// the response deserializes cleanly into the same struct.
#[derive(Debug, Deserialize)]
struct RefreshResponse {
    lifegw_token: String,
    lifegw_token_expires_at: u64,
}

/// Hit `POST {api_base}/api/auth/lifegw-token` with the HS256 Bearer to
/// mint a fresh ES256 Tier-1 token.
///
/// Returns the new token and its expiry epoch (seconds). The caller is
/// responsible for persisting via `store_lifegw_token`.
///
/// Error map:
///
/// * `401` → [`BroomvaError::AuthRequired`] — the HS256 session itself
///   is dead; user must re-run `broomva auth login`
/// * other non-2xx → [`BroomvaError::Api`] with the server's response
///   body verbatim
/// * transport failure → [`BroomvaError::User`] with a network hint
pub async fn refresh_lifegw_token(
    client: &reqwest::Client,
    api_base: &str,
    hs256: &str,
) -> BroomvaResult<(String, u64)> {
    let url = format!("{}/api/auth/lifegw-token", api_base.trim_end_matches('/'));
    let resp = client
        .post(&url)
        .header("Authorization", format!("Bearer {hs256}"))
        .send()
        .await
        .map_err(|e| {
            BroomvaError::User(format!(
                "lifegw token refresh: HTTP transport failed: {e} — is {api_base} reachable?"
            ))
        })?;

    let status = resp.status();
    if status.as_u16() == 401 {
        return Err(BroomvaError::AuthRequired);
    }
    if !status.is_success() {
        let code = status.as_u16();
        let body = resp.text().await.unwrap_or_default();
        return Err(BroomvaError::Api {
            status: code,
            message: format!("lifegw token refresh failed: HTTP {code}"),
            body: Some(body),
        });
    }

    let parsed: RefreshResponse = resp.json().await.map_err(|e| BroomvaError::Api {
        status: 0,
        message: format!("failed to parse lifegw token refresh response: {e}"),
        body: None,
    })?;
    Ok((parsed.lifegw_token, parsed.lifegw_token_expires_at))
}

/// Refresh the persisted Tier-1 lifegw JWT if it's within
/// `refresh_threshold_secs` of expiry (or already expired, or missing
/// entirely). No-op when the token has plenty of life left.
///
/// On refresh success, the new token + expiry are persisted via
/// `store_lifegw_token` (atomic write through `update_config`). The
/// next caller to read config sees the fresh values.
///
/// On `AuthRequired` (HS256 dead), the error is propagated unchanged —
/// the chat path will surface "run `broomva auth login`" to the user.
///
/// Network failures + non-2xx, non-401 server responses are propagated
/// as `BroomvaError::Api` / `BroomvaError::User` so callers can decide
/// whether to retry or proceed with the (possibly stale) token already
/// in config.
pub async fn ensure_fresh_lifegw_token(
    client: &reqwest::Client,
    api_base: &str,
    refresh_threshold_secs: u64,
) -> BroomvaResult<()> {
    let cfg = config::read_config()?;

    // No HS256 session at all → nothing to refresh against. Caller
    // discovers this via the downstream lifegw 401 → AuthRequired path,
    // which is the right UX (consistent error message).
    let Some(ref hs256) = cfg.token else {
        return Ok(());
    };

    // No Tier-1 token persisted yet → mint one now (covers the rare
    // case where login partially succeeded — HS256 stored, lifegw mint
    // failed non-fatally per device-token route's posture).
    if cfg.lifegw_token.is_none() {
        let (new_token, new_exp) = refresh_lifegw_token(client, api_base, hs256).await?;
        store_lifegw_token(&new_token, Some(new_exp))?;
        return Ok(());
    }

    // Refresh when within threshold of expiry. A missing
    // `lifegw_token_expires_at` is treated as "near expiry" — defensive
    // for older configs that persisted the token without the epoch
    // (shouldn't happen post-BRO-1203 but cheap to be safe).
    let now_secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let needs_refresh = match cfg.lifegw_token_expires_at {
        Some(exp) => exp <= now_secs.saturating_add(refresh_threshold_secs),
        None => true,
    };

    if !needs_refresh {
        return Ok(());
    }

    let (new_token, new_exp) = refresh_lifegw_token(client, api_base, hs256).await?;
    store_lifegw_token(&new_token, Some(new_exp))?;
    Ok(())
}

/// Convenience wrapper for callers that don't need to thread a
/// `reqwest::Client` themselves. Uses a short-timeout client matched to
/// the existing CLI conventions for short interactive calls.
pub async fn ensure_fresh_lifegw_token_with_default_client(
    api_base: &str,
) -> BroomvaResult<()> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .connect_timeout(Duration::from_secs(5))
        .build()
        .map_err(|e| BroomvaError::User(format!("reqwest client builder failed: {e}")))?;
    ensure_fresh_lifegw_token(&client, api_base, DEFAULT_REFRESH_THRESHOLD_SECS).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use wiremock::matchers::{header, method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    #[tokio::test]
    async fn refresh_lifegw_token_200_returns_new_token_and_expiry() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/api/auth/lifegw-token"))
            .and(header("authorization", "Bearer hs256.test"))
            .respond_with(
                ResponseTemplate::new(200)
                    .set_body_json(serde_json::json!({
                        "lifegw_token": "new.es256.token",
                        "lifegw_token_expires_at": 1_800_000_000_u64
                    })),
            )
            .mount(&server)
            .await;

        let client = reqwest::Client::new();
        let (token, exp) = refresh_lifegw_token(&client, &server.uri(), "hs256.test")
            .await
            .unwrap();
        assert_eq!(token, "new.es256.token");
        assert_eq!(exp, 1_800_000_000);
    }

    #[tokio::test]
    async fn refresh_lifegw_token_401_returns_auth_required() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/api/auth/lifegw-token"))
            .respond_with(ResponseTemplate::new(401).set_body_json(
                serde_json::json!({ "error": "invalid_token" }),
            ))
            .mount(&server)
            .await;

        let client = reqwest::Client::new();
        let err = refresh_lifegw_token(&client, &server.uri(), "dead.hs256")
            .await
            .unwrap_err();
        match err {
            BroomvaError::AuthRequired => {}
            other => panic!("expected AuthRequired, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn refresh_lifegw_token_502_returns_api_error_with_body() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/api/auth/lifegw-token"))
            .respond_with(
                ResponseTemplate::new(502)
                    .set_body_json(serde_json::json!({ "error": "mint_failed" })),
            )
            .mount(&server)
            .await;

        let client = reqwest::Client::new();
        let err = refresh_lifegw_token(&client, &server.uri(), "hs256.test")
            .await
            .unwrap_err();
        match err {
            BroomvaError::Api { status, body, .. } => {
                assert_eq!(status, 502);
                assert!(body.unwrap().contains("mint_failed"));
            }
            other => panic!("expected Api error, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn refresh_lifegw_token_attaches_bearer_header() {
        // wiremock's `header()` matcher above is what catches the wrong
        // Authorization header. This test is a redundant explicit
        // assertion: if the route forgets the Bearer header entirely,
        // the mock returns 404 (no matching expectation) and refresh
        // returns an Api error rather than 200.
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/api/auth/lifegw-token"))
            .and(header("authorization", "Bearer expected-token"))
            .respond_with(
                ResponseTemplate::new(200)
                    .set_body_json(serde_json::json!({
                        "lifegw_token": "t",
                        "lifegw_token_expires_at": 1_u64,
                    })),
            )
            .mount(&server)
            .await;

        let client = reqwest::Client::new();
        // Wrong bearer → mock doesn't match → 404 → Api error
        let err = refresh_lifegw_token(&client, &server.uri(), "wrong-token")
            .await
            .unwrap_err();
        assert!(matches!(err, BroomvaError::Api { .. }));

        // Right bearer → 200
        let ok = refresh_lifegw_token(&client, &server.uri(), "expected-token").await;
        assert!(ok.is_ok());
    }
}
