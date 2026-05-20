use crate::api::BroomvaClient;
use crate::cli::output::{OutputFormat, print_kv};
use crate::config;
use crate::error::BroomvaResult;

pub async fn handle_login(client: &BroomvaClient, manual: bool) -> BroomvaResult<()> {
    if manual {
        crate::api::auth::manual_login().await
    } else {
        crate::api::auth::device_login(client.raw_client(), client.base_url()).await?;
        Ok(())
    }
}

pub async fn handle_logout() -> BroomvaResult<()> {
    config::clear_token()?;
    println!("  Logged out.");
    Ok(())
}

pub async fn handle_status(client: &BroomvaClient, format: OutputFormat) -> BroomvaResult<()> {
    let config = config::read_config()?;

    if format == OutputFormat::Json {
        let status = serde_json::json!({
            "authenticated": config.token.is_some(),
            "apiBase": client.base_url(),
            "tokenExpiresAt": config.token_expires_at,
            // BRO-1203 — lifegw token state. `present`/`absent`
            // rather than the raw token; expiry is epoch seconds.
            "lifegwToken": if config.lifegw_token.is_some() { "present" } else { "absent" },
            "lifegwTokenExpiresAt": config.lifegw_token_expires_at,
        });
        crate::cli::output::print_json_value(&status);
        return Ok(());
    }

    if config.token.is_some() {
        let valid = client.validate_token().await.unwrap_or(false);
        print_kv(
            "Status",
            if valid {
                "authenticated"
            } else {
                "token invalid"
            },
        );
        print_kv("API Base", client.base_url());
        if let Some(ref exp) = config.token_expires_at {
            print_kv("Expires", exp);
        }
        // BRO-1203 — surface lifegw token presence so users can tell
        // whether `broomva chat --gateway-url https://life.broomva.tech`
        // will work without re-logging-in.
        print_kv(
            "Lifegw Token",
            if config.lifegw_token.is_some() {
                "present (ES256)"
            } else {
                "absent (re-run `broomva auth login` to mint)"
            },
        );
        if let Some(exp) = config.lifegw_token_expires_at {
            print_kv("Lifegw Expires", &format_lifegw_expiry(exp));
        }
    } else {
        print_kv("Status", "not authenticated");
        println!("  Run `broomva auth login` to authenticate.");
    }
    Ok(())
}

/// Format the lifegw token expiry (epoch seconds) into a human-readable
/// label. Returns the epoch verbatim on parse failure rather than
/// panicking — observability never blocks login.
fn format_lifegw_expiry(epoch_secs: u64) -> String {
    use chrono::{DateTime, Utc};
    DateTime::<Utc>::from_timestamp(epoch_secs as i64, 0)
        .map(|dt| dt.to_rfc3339())
        .unwrap_or_else(|| format!("epoch:{epoch_secs}"))
}

pub async fn handle_token() -> BroomvaResult<()> {
    let config = config::read_config()?;
    match config.token {
        Some(tok) => println!("{tok}"),
        None => {
            eprintln!("  No token stored. Run `broomva auth login`.");
            std::process::exit(1);
        }
    }
    Ok(())
}
