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
        let resp = self.request(Method::GET, "/api/console/health").send().await?;
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
        let resp = self
            .request(Method::GET, "/api/relay/nodes")
            .send()
            .await?;
        Ok(resp.status().is_success())
    }
}
