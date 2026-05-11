pub mod auth;
pub mod types;

use std::time::Duration;

use reqwest::Method;

use crate::error::{BroomvaError, BroomvaResult};
use types::*;

/// HTTP client for the broomva.tech API.
pub struct BroomvaClient {
    base_url: String,
    token: Option<String>,
    client: reqwest::Client,
}

impl BroomvaClient {
    pub fn new(base_url: String, token: Option<String>) -> Self {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            .connect_timeout(Duration::from_secs(10))
            .build()
            .expect("failed to create HTTP client");
        Self {
            base_url,
            token,
            client,
        }
    }

    /// Raw reqwest client for device auth flow.
    pub fn raw_client(&self) -> &reqwest::Client {
        &self.client
    }

    pub fn base_url(&self) -> &str {
        &self.base_url
    }

    fn request(&self, method: Method, path: &str) -> reqwest::RequestBuilder {
        let url = format!("{}{}", self.base_url, path);
        let mut req = self.client.request(method, &url);
        if let Some(ref token) = self.token {
            req = req.header("Authorization", format!("Bearer {token}"));
        }
        req
    }

    async fn check_response(&self, resp: reqwest::Response) -> BroomvaResult<reqwest::Response> {
        let status = resp.status();
        if status.as_u16() == 401 {
            return Err(BroomvaError::AuthRequired);
        }
        if !status.is_success() {
            let code = status.as_u16();
            let body = resp.text().await.unwrap_or_default();
            return Err(BroomvaError::Api {
                status: code,
                message: format!("HTTP {code}"),
                body: Some(body),
            });
        }
        Ok(resp)
    }

    // ── Prompts ──

    pub async fn list_prompts(
        &self,
        category: Option<&str>,
        tag: Option<&str>,
        model: Option<&str>,
        mine: bool,
    ) -> BroomvaResult<Vec<PromptSummary>> {
        let mut req = self.request(Method::GET, "/api/prompts");
        if let Some(c) = category {
            req = req.query(&[("category", c)]);
        }
        if let Some(t) = tag {
            req = req.query(&[("tag", t)]);
        }
        if let Some(m) = model {
            req = req.query(&[("model", m)]);
        }
        if mine {
            req = req.query(&[("mine", "true")]);
        }
        let resp = req.send().await?;
        let resp = self.check_response(resp).await?;
        let body: ApiListResponse<PromptSummary> = resp.json().await?;
        Ok(body.data.unwrap_or_default())
    }

    pub async fn get_prompt(&self, slug: &str) -> BroomvaResult<PromptDetail> {
        let resp = self
            .request(Method::GET, &format!("/api/prompts/{slug}"))
            .send()
            .await?;
        let resp = self.check_response(resp).await?;
        let body: ApiResponse<PromptDetail> = resp.json().await?;
        body.data.ok_or_else(|| BroomvaError::Api {
            status: 404,
            message: format!("prompt not found: {slug}"),
            body: None,
        })
    }

    pub async fn create_prompt(&self, req: CreatePromptRequest) -> BroomvaResult<PromptDetail> {
        let resp = self
            .request(Method::POST, "/api/prompts")
            .json(&req)
            .send()
            .await?;
        let resp = self.check_response(resp).await?;
        let body: ApiResponse<PromptDetail> = resp.json().await?;
        body.data.ok_or_else(|| BroomvaError::Api {
            status: 500,
            message: "create returned no data".into(),
            body: None,
        })
    }

    pub async fn update_prompt(
        &self,
        slug: &str,
        req: UpdatePromptRequest,
    ) -> BroomvaResult<PromptDetail> {
        let resp = self
            .request(Method::PUT, &format!("/api/prompts/{slug}"))
            .json(&req)
            .send()
            .await?;
        let resp = self.check_response(resp).await?;
        let body: ApiResponse<PromptDetail> = resp.json().await?;
        body.data.ok_or_else(|| BroomvaError::Api {
            status: 500,
            message: "update returned no data".into(),
            body: None,
        })
    }

    pub async fn delete_prompt(&self, slug: &str) -> BroomvaResult<()> {
        let resp = self
            .request(Method::DELETE, &format!("/api/prompts/{slug}"))
            .send()
            .await?;
        self.check_response(resp).await?;
        Ok(())
    }

    // ── Skills ──

    pub async fn list_skills(&self, layer: Option<&str>) -> BroomvaResult<Vec<SkillSummary>> {
        let mut req = self.request(Method::GET, "/api/skills");
        if let Some(l) = layer {
            req = req.query(&[("layer", l)]);
        }
        let resp = req.send().await?;
        let resp = self.check_response(resp).await?;
        let body: ApiListResponse<SkillSummary> = resp.json().await?;
        Ok(body.data.unwrap_or_default())
    }

    pub async fn get_skill(&self, slug: &str) -> BroomvaResult<SkillDetail> {
        let resp = self
            .request(Method::GET, &format!("/api/skills/{slug}"))
            .send()
            .await?;
        let resp = self.check_response(resp).await?;
        let body: ApiResponse<SkillDetail> = resp.json().await?;
        body.data.ok_or_else(|| BroomvaError::Api {
            status: 404,
            message: format!("skill not found: {slug}"),
            body: None,
        })
    }

    // ── Context ──

    pub async fn get_context(&self) -> BroomvaResult<ContextInfo> {
        let resp = self.request(Method::GET, "/api/context").send().await?;
        let resp = self.check_response(resp).await?;
        let body: ContextInfo = resp.json().await?;
        Ok(body)
    }

    // ── Console ──

    pub async fn get_console_health(&self) -> BroomvaResult<ConsoleHealth> {
        let resp = self
            .request(Method::GET, "/api/console/health")
            .send()
            .await?;
        let resp = self.check_response(resp).await?;
        Ok(resp.json().await?)
    }

    pub async fn list_agent_sessions(&self) -> BroomvaResult<Vec<AgentSession>> {
        let resp = self
            .request(Method::GET, "/api/agent/sessions")
            .send()
            .await?;
        let resp = self.check_response(resp).await?;
        let body: ApiListResponse<AgentSession> = resp.json().await?;
        Ok(body.data.unwrap_or_default())
    }

    // ── Auth validation ──

    pub async fn validate_token(&self) -> BroomvaResult<bool> {
        // Use /api/relay/nodes as the validation endpoint — it accepts both
        // session cookies and Bearer JWTs (withRelayAuth), unlike the Neon
        // Auth session endpoint which only accepts cookies.
        let resp = self.request(Method::GET, "/api/relay/nodes").send().await?;
        Ok(resp.status().is_success())
    }

    // ── Invocations (Phase 2 telemetry) ──
    // Methods below are exercised by telemetry_client_tests; CLI handlers in
    // Batch B/C will wire them into commands. #[allow(dead_code)] suppresses
    // bin-target dead-code lints until those handlers land.

    pub async fn create_invocation(
        &self,
        req: &InvocationCreateRequest,
    ) -> BroomvaResult<InvocationCreateResponse> {
        let resp = self
            .request(Method::POST, "/api/invocations")
            .json(req)
            .send()
            .await?;
        let resp = self.check_response(resp).await?;
        Ok(resp.json().await?)
    }

    pub async fn update_invocation(
        &self,
        id: &str,
        req: &InvocationUpdateRequest,
    ) -> BroomvaResult<InvocationRow> {
        let resp = self
            .request(Method::PATCH, &format!("/api/invocations/{id}"))
            .json(req)
            .send()
            .await?;
        let resp = self.check_response(resp).await?;
        Ok(resp.json().await?)
    }

    // ── Feedback (Phase 2 telemetry) ──

    pub async fn create_feedback(
        &self,
        req: &FeedbackCreateRequest,
    ) -> BroomvaResult<FeedbackCreateResponse> {
        let resp = self
            .request(Method::POST, "/api/feedback")
            .json(req)
            .send()
            .await?;
        let resp = self.check_response(resp).await?;
        Ok(resp.json().await?)
    }

    #[allow(dead_code)]
    pub async fn list_feedback_for_prompt(
        &self,
        slug: &str,
        limit: Option<u32>,
    ) -> BroomvaResult<Vec<FeedbackRow>> {
        let mut req = self.request(Method::GET, "/api/feedback");
        req = req.query(&[("prompt_slug", slug)]);
        if let Some(n) = limit {
            req = req.query(&[("limit", n.to_string())]);
        }
        let resp = req.send().await?;
        let resp = self.check_response(resp).await?;
        Ok(resp.json().await?)
    }

    // ── Metrics (Phase 2 telemetry) ──

    #[allow(dead_code)]
    pub async fn get_metrics_overview(
        &self,
        since: Option<&str>,
    ) -> BroomvaResult<MetricsOverview> {
        let mut req = self.request(Method::GET, "/api/metrics/overview");
        if let Some(s) = since {
            req = req.query(&[("since", s)]);
        }
        let resp = req.send().await?;
        let resp = self.check_response(resp).await?;
        Ok(resp.json().await?)
    }

    #[allow(dead_code)]
    pub async fn list_recent_invocations(
        &self,
        prompt_slug: Option<&str>,
        source: Option<&str>,
        limit: Option<u32>,
    ) -> BroomvaResult<Vec<InvocationRow>> {
        let mut req = self.request(Method::GET, "/api/metrics/runs");
        if let Some(s) = prompt_slug {
            req = req.query(&[("prompt_slug", s)]);
        }
        if let Some(s) = source {
            req = req.query(&[("source", s)]);
        }
        if let Some(n) = limit {
            req = req.query(&[("limit", n.to_string())]);
        }
        let resp = req.send().await?;
        let resp = self.check_response(resp).await?;
        Ok(resp.json().await?)
    }

    #[allow(dead_code)]
    pub async fn get_metrics_volume(
        &self,
        bucket: &str,
        since: &str,
    ) -> BroomvaResult<Vec<VolumeBucketRow>> {
        let resp = self
            .request(Method::GET, "/api/metrics/volume")
            .query(&[("bucket", bucket), ("since", since)])
            .send()
            .await?;
        let resp = self.check_response(resp).await?;
        Ok(resp.json().await?)
    }

    #[allow(dead_code)]
    pub async fn get_metrics_for_slug(&self, slug: &str) -> BroomvaResult<PromptMetrics> {
        let resp = self
            .request(Method::GET, &format!("/api/metrics/prompts/{slug}"))
            .send()
            .await?;
        let resp = self.check_response(resp).await?;
        Ok(resp.json().await?)
    }
}

#[cfg(test)]
mod telemetry_client_tests {
    use super::*;
    use wiremock::matchers::{method, path, header, body_partial_json};
    use wiremock::{Mock, MockServer, ResponseTemplate};
    use serde_json::json;

    fn test_client(base: String) -> BroomvaClient {
        BroomvaClient::new(base, Some("test-token".into()))
    }

    #[tokio::test]
    async fn create_invocation_posts_and_returns_id() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/api/invocations"))
            .and(header("Authorization", "Bearer test-token"))
            .and(body_partial_json(json!({
                "prompt_slug": "code-review-agent",
                "source": "cli"
            })))
            .respond_with(ResponseTemplate::new(201).set_body_json(json!({
                "id": "abc-123",
                "created_at": "2026-05-11T00:00:00Z"
            })))
            .mount(&server)
            .await;

        let client = test_client(server.uri());
        let req = InvocationCreateRequest {
            id: None,
            prompt_slug: "code-review-agent".into(),
            prompt_version: "1.0".into(),
            source: "cli".into(),
            caller: Some("broomva-cli/0.3.0".into()),
            session_id: None,
            variables: None,
            metadata: None,
        };
        let resp = client.create_invocation(&req).await.unwrap();
        assert_eq!(resp.id, "abc-123");
    }

    #[tokio::test]
    async fn update_invocation_patches() {
        let server = MockServer::start().await;
        Mock::given(method("PATCH"))
            .and(path("/api/invocations/abc-123"))
            .and(body_partial_json(json!({"status": "completed"})))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "id": "abc-123",
                "prompt_slug": "x",
                "prompt_version": "1.0",
                "source": "cli",
                "caller": null,
                "user_id": null,
                "agent_id": null,
                "session_id": null,
                "client_ip_hash": null,
                "variables": null,
                "status": "completed",
                "model": "claude-sonnet-4.5",
                "latency_ms": 100,
                "tokens_in": 10,
                "tokens_out": 20,
                "cost_usd": 0.001,
                "error_message": null,
                "external_trace_id": null,
                "external_span_id": null,
                "metadata": null,
                "created_at": "2026-05-11T00:00:00Z",
                "completed_at": "2026-05-11T00:00:01Z"
            })))
            .mount(&server)
            .await;

        let client = test_client(server.uri());
        let req = InvocationUpdateRequest {
            status: "completed".into(),
            model: Some("claude-sonnet-4.5".into()),
            latency_ms: Some(100),
            tokens_in: Some(10),
            tokens_out: Some(20),
            error_message: None,
        };
        let row = client.update_invocation("abc-123", &req).await.unwrap();
        assert_eq!(row.status, "completed");
        assert_eq!(row.model.as_deref(), Some("claude-sonnet-4.5"));
    }

    #[tokio::test]
    async fn create_feedback_posts() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/api/feedback"))
            .and(body_partial_json(json!({"signal": "thumbs_up"})))
            .respond_with(ResponseTemplate::new(201).set_body_json(json!({
                "id": "fb-1",
                "created_at": "2026-05-11T00:00:00Z"
            })))
            .mount(&server)
            .await;

        let client = test_client(server.uri());
        let req = FeedbackCreateRequest {
            invocation_id: Some("abc".into()),
            prompt_slug: "x".into(),
            prompt_version: "1.0".into(),
            signal: "thumbs_up".into(),
            text: None,
            source: "cli".into(),
        };
        let resp = client.create_feedback(&req).await.unwrap();
        assert_eq!(resp.id, "fb-1");
    }

    #[tokio::test]
    async fn get_metrics_overview_returns_typed_shape() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/api/metrics/overview"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "since": "7d",
                "as_of": "2026-05-11T00:00:00Z",
                "last_invocation_at": null,
                "totals": {"prompts":29,"copies":100,"cli_pulls":50,"skill_invokes":200,"traces":350,"runs_7d":350},
                "deltas_vs_prev": {"copies":0.1,"cli_pulls":0.2,"skill_invokes":0.3,"traces":0.2},
                "live_failures_1h": 3
            })))
            .mount(&server)
            .await;

        let client = test_client(server.uri());
        let m = client.get_metrics_overview(Some("7d")).await.unwrap();
        assert_eq!(m.totals.prompts, 29);
        assert_eq!(m.live_failures_1h, 3);
    }

    #[tokio::test]
    async fn get_metrics_for_slug_returns_shape() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/api/metrics/prompts/code-review-agent"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "totals": {"copies":10,"cli_pulls":5,"skill_invokes":20,"traces":35},
                "runs_7d": 12,
                "delta_pct": 0.0,
                "last_used_at": null,
                "avg_latency_ms": null,
                "avg_cost_usd": null,
                "feedback": {"thumbs_up":3,"thumbs_down":1,"rate":0.75},
                "timeseries": {"pass_rate_7d_by_day":null,"volume_7d_by_day":[]}
            })))
            .mount(&server)
            .await;

        let client = test_client(server.uri());
        let m = client.get_metrics_for_slug("code-review-agent").await.unwrap();
        assert_eq!(m.totals.skill_invokes, 20);
        assert!((m.feedback.rate.unwrap() - 0.75).abs() < 1e-9);
    }

    #[tokio::test]
    async fn create_invocation_swallows_429_into_typed_error() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/api/invocations"))
            .respond_with(ResponseTemplate::new(429).set_body_json(json!({
                "error": "Rate limit exceeded",
                "code": "rate_limited"
            })))
            .mount(&server)
            .await;

        let client = test_client(server.uri());
        let req = InvocationCreateRequest {
            id: None,
            prompt_slug: "x".into(),
            prompt_version: "1.0".into(),
            source: "cli".into(),
            caller: None,
            session_id: None,
            variables: None,
            metadata: None,
        };
        let result = client.create_invocation(&req).await;
        assert!(result.is_err(), "expected error, got {:?}", result);
        match result.unwrap_err() {
            BroomvaError::Api { status, .. } => assert_eq!(status, 429),
            other => panic!("expected Api err, got {other:?}"),
        }
    }
}
