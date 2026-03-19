use std::time::Duration;

use serde::Deserialize;

/// HTTP client for querying the Symphony REST API.
pub struct SymphonyHttpClient {
    base_url: String,
    token: Option<String>,
    client: reqwest::Client,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SymphonyState {
    #[serde(flatten)]
    pub data: serde_json::Value,
}

impl SymphonyHttpClient {
    pub fn new(base_url: String, token: Option<String>) -> Self {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(10))
            .connect_timeout(Duration::from_secs(5))
            .build()
            .expect("failed to create Symphony HTTP client");
        Self {
            base_url,
            token,
            client,
        }
    }

    fn request(&self, path: &str) -> reqwest::RequestBuilder {
        let url = format!("{}{}", self.base_url, path);
        let mut req = self.client.get(&url);
        if let Some(ref token) = self.token {
            req = req.header("Authorization", format!("Bearer {token}"));
        }
        req
    }

    /// Check if Symphony is reachable.
    pub async fn healthz(&self) -> bool {
        self.request("/healthz")
            .send()
            .await
            .map(|r| r.status().is_success())
            .unwrap_or(false)
    }

    /// Get Symphony state summary.
    pub async fn get_state(&self) -> Option<SymphonyState> {
        self.request("/api/v1/state")
            .send()
            .await
            .ok()?
            .json()
            .await
            .ok()
    }
}
