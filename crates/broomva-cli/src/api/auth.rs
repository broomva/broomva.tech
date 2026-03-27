use std::io::{self, Write};
use std::time::Duration;

use crate::api::types::{DeviceCodeResponse, DeviceTokenError, DeviceTokenRequest, TokenResponse};
use crate::config;
use crate::error::{BroomvaError, BroomvaResult};

/// Run the device code login flow (RFC 8628).
pub async fn device_login(client: &reqwest::Client, base: &str) -> BroomvaResult<TokenResponse> {
    // 1. Request a device code.
    let code_url = format!("{base}/api/auth/device/code");
    let resp = client
        .post(&code_url)
        .json(&serde_json::json!({}))
        .send()
        .await
        .map_err(|e| BroomvaError::Api {
            status: 0,
            message: format!("failed to request device code: {e}"),
            body: None,
        })?;

    if !resp.status().is_success() {
        let status = resp.status().as_u16();
        let body = resp.text().await.unwrap_or_default();
        return Err(BroomvaError::Api {
            status,
            message: "device code request failed".into(),
            body: Some(body),
        });
    }

    let device: DeviceCodeResponse = resp.json().await?;

    // 2. Show the user code and try to open the browser.
    println!();
    println!("  Open this URL in your browser:");
    println!();
    let verify_url = device
        .verification_uri_complete
        .as_deref()
        .unwrap_or(&device.verification_uri);
    println!("    {verify_url}");
    println!();
    println!("  And enter code: {}", device.user_code);
    println!();

    // Best-effort browser open.
    let _ = open::that(verify_url);

    // 3. Poll for token.
    let mut interval = device.interval;
    let token_url = format!("{base}/api/auth/device/token");

    loop {
        tokio::time::sleep(Duration::from_secs(interval)).await;

        let poll_resp = client
            .post(&token_url)
            .json(&DeviceTokenRequest {
                device_code: device.device_code.clone(),
                grant_type: "urn:ietf:params:oauth:grant-type:device_code".into(),
            })
            .send()
            .await
            .map_err(|e| BroomvaError::Api {
                status: 0,
                message: format!("token poll failed: {e}"),
                body: None,
            })?;

        let status = poll_resp.status();

        if status.is_success() {
            let token: TokenResponse = poll_resp.json().await?;
            config::store_token(&token.access_token, token.expires_at.as_deref())?;
            println!("  Authenticated successfully.");
            return Ok(token);
        }

        // Try to parse as error response.
        let body = poll_resp.text().await.unwrap_or_default();
        if let Ok(err) = serde_json::from_str::<DeviceTokenError>(&body) {
            match err.error.as_str() {
                "authorization_pending" => {
                    // Keep polling.
                    continue;
                }
                "slow_down" => {
                    interval += 5;
                    continue;
                }
                "access_denied" => {
                    return Err(BroomvaError::User("login denied by user".into()));
                }
                "expired_token" => {
                    return Err(BroomvaError::User(
                        "device code expired — run `broomva auth login` again".into(),
                    ));
                }
                other => {
                    return Err(BroomvaError::Api {
                        status: status.as_u16(),
                        message: format!("unexpected error: {other}"),
                        body: Some(body),
                    });
                }
            }
        }

        return Err(BroomvaError::Api {
            status: status.as_u16(),
            message: "unexpected response during token poll".into(),
            body: Some(body),
        });
    }
}

/// Device login with agent metadata — registers as a relay node or agent.
///
/// Sends agent_name, host_id, and requested_capabilities in the device code
/// request so the approval page shows the correct agent flow.
pub async fn device_login_as_agent(
    client: &reqwest::Client,
    base: &str,
    agent_name: &str,
    host_id: &str,
    capabilities: &[&str],
) -> BroomvaResult<TokenResponse> {
    let code_url = format!("{base}/api/auth/device/code");
    let resp = client
        .post(&code_url)
        .json(&serde_json::json!({
            "client_id": format!("agent:{agent_name}"),
            "agent_name": agent_name,
            "host_id": host_id,
            "requested_capabilities": capabilities,
        }))
        .send()
        .await
        .map_err(|e| BroomvaError::Api {
            status: 0,
            message: format!("failed to request device code: {e}"),
            body: None,
        })?;

    if !resp.status().is_success() {
        let status = resp.status().as_u16();
        let body = resp.text().await.unwrap_or_default();
        return Err(BroomvaError::Api {
            status,
            message: "device code request failed".into(),
            body: Some(body),
        });
    }

    let device: DeviceCodeResponse = resp.json().await?;

    println!();
    println!("  Registering relay node: {agent_name}");
    println!();
    let verify_url = device
        .verification_uri_complete
        .as_deref()
        .unwrap_or(&device.verification_uri);
    println!("  Open this URL to approve:");
    println!("    {verify_url}");
    println!();
    println!("  Code: {}", device.user_code);
    println!();

    let _ = open::that(verify_url);

    // Poll for token (same loop as device_login)
    let mut interval = device.interval;
    let token_url = format!("{base}/api/auth/device/token");

    loop {
        tokio::time::sleep(Duration::from_secs(interval)).await;

        let poll_resp = client
            .post(&token_url)
            .json(&DeviceTokenRequest {
                device_code: device.device_code.clone(),
                grant_type: "urn:ietf:params:oauth:grant-type:device_code".into(),
            })
            .send()
            .await
            .map_err(|e| BroomvaError::Api {
                status: 0,
                message: format!("token poll failed: {e}"),
                body: None,
            })?;

        let status = poll_resp.status();

        if status.is_success() {
            let token: TokenResponse = poll_resp.json().await?;
            println!("  Relay node registered successfully.");
            return Ok(token);
        }

        let body = poll_resp.text().await.unwrap_or_default();
        if let Ok(err) = serde_json::from_str::<DeviceTokenError>(&body) {
            match err.error.as_str() {
                "authorization_pending" => continue,
                "slow_down" => {
                    interval += 5;
                    continue;
                }
                "access_denied" => {
                    return Err(BroomvaError::User("registration denied by user".into()));
                }
                "expired_token" => {
                    return Err(BroomvaError::User(
                        "device code expired — run `broomva relay auth` again".into(),
                    ));
                }
                other => {
                    return Err(BroomvaError::Api {
                        status: status.as_u16(),
                        message: format!("unexpected error: {other}"),
                        body: Some(body),
                    });
                }
            }
        }

        return Err(BroomvaError::Api {
            status: status.as_u16(),
            message: "unexpected response during token poll".into(),
            body: Some(body),
        });
    }
}

/// Manual login: prompt user for token on stdin.
pub async fn manual_login() -> BroomvaResult<()> {
    print!("  Paste your API token: ");
    io::stdout().flush()?;

    let mut token = String::new();
    io::stdin().read_line(&mut token)?;
    let token = token.trim();

    if token.is_empty() {
        return Err(BroomvaError::User("no token provided".into()));
    }

    config::store_token(token, None)?;
    println!("  Token saved.");
    Ok(())
}
