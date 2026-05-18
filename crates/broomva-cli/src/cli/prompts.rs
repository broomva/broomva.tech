use std::fs;
use std::path::Path;

use crate::api::BroomvaClient;
use crate::api::types::{CreatePromptRequest, UpdatePromptRequest};
use crate::cli::output::{OutputFormat, print_json, print_kv, print_table};
use crate::error::{BroomvaError, BroomvaResult};
use crate::frontmatter;

#[allow(clippy::too_many_arguments)]
pub async fn handle_list(
    client: &BroomvaClient,
    category: Option<&str>,
    tag: Option<&str>,
    model: Option<&str>,
    mine: bool,
    metrics: bool,
    sort: Option<&str>,
    format: OutputFormat,
) -> BroomvaResult<()> {
    // Standard list path
    if !metrics {
        let prompts = client.list_prompts(category, tag, model, mine).await?;
        if format == OutputFormat::Json {
            print_json(&prompts);
            return Ok(());
        }
        let rows: Vec<Vec<String>> = prompts
            .iter()
            .map(|p| {
                vec![
                    p.slug.clone(),
                    p.title.clone(),
                    p.category.clone().unwrap_or_default(),
                    p.model.clone().unwrap_or_default(),
                    p.visibility.clone().unwrap_or_default(),
                ]
            })
            .collect();
        print_table(
            &["slug", "title", "category", "model", "visibility"],
            &rows,
            format,
        );
        return Ok(());
    }

    // Metrics-enriched path — server returns the prompt list wrapper +
    // snake_case `metrics` block per item.
    let entries = client
        .list_prompts_with_metrics(category, tag, model, sort)
        .await?;

    if format == OutputFormat::Json {
        print_json(&entries);
        return Ok(());
    }

    let rows: Vec<Vec<String>> = entries
        .iter()
        .map(|e| {
            let slug = e
                .get("slug")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let title = e
                .get("title")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let category = e
                .get("category")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let m = e.get("metrics");
            let copies = m
                .and_then(|x| x.get("copies"))
                .and_then(|v| v.as_i64())
                .unwrap_or(0);
            let cli = m
                .and_then(|x| x.get("cli_pulls"))
                .and_then(|v| v.as_i64())
                .unwrap_or(0);
            let skill = m
                .and_then(|x| x.get("skill_invokes"))
                .and_then(|v| v.as_i64())
                .unwrap_or(0);
            let runs7 = m
                .and_then(|x| x.get("runs_7d"))
                .and_then(|v| v.as_i64())
                .unwrap_or(0);
            vec![
                slug,
                title,
                category,
                copies.to_string(),
                cli.to_string(),
                skill.to_string(),
                runs7.to_string(),
            ]
        })
        .collect();

    print_table(
        &[
            "slug", "title", "category", "copies", "cli", "skill", "runs7d",
        ],
        &rows,
        format,
    );

    Ok(())
}

pub async fn handle_get(
    client: &BroomvaClient,
    slug: &str,
    raw: bool,
    format: OutputFormat,
) -> BroomvaResult<()> {
    let prompt = client.get_prompt(slug).await?;

    if format == OutputFormat::Json {
        print_json(&prompt);
        return Ok(());
    }

    if raw {
        println!("{}", prompt.content);
        return Ok(());
    }

    print_kv("Title", &prompt.title);
    print_kv("Slug", &prompt.slug);
    if let Some(ref s) = prompt.summary {
        print_kv("Summary", s);
    }
    if let Some(ref c) = prompt.category {
        print_kv("Category", c);
    }
    if let Some(ref m) = prompt.model {
        print_kv("Model", m);
    }
    if let Some(ref tags) = prompt.tags {
        print_kv("Tags", &tags.join(", "));
    }
    if let Some(ref v) = prompt.visibility {
        print_kv("Visibility", v);
    }
    println!();
    println!("{}", prompt.content);
    Ok(())
}

pub async fn handle_create(
    client: &BroomvaClient,
    req: CreatePromptRequest,
    format: OutputFormat,
) -> BroomvaResult<()> {
    let prompt = client.create_prompt(req).await?;

    if format == OutputFormat::Json {
        print_json(&prompt);
    } else {
        println!("  Created prompt: {}", prompt.slug);
    }
    Ok(())
}

pub async fn handle_update(
    client: &BroomvaClient,
    slug: &str,
    req: UpdatePromptRequest,
    format: OutputFormat,
) -> BroomvaResult<()> {
    let prompt = client.update_prompt(slug, req).await?;

    if format == OutputFormat::Json {
        print_json(&prompt);
    } else {
        println!("  Updated prompt: {}", prompt.slug);
    }
    Ok(())
}

pub async fn handle_delete(client: &BroomvaClient, slug: &str) -> BroomvaResult<()> {
    client.delete_prompt(slug).await?;
    println!("  Deleted prompt: {slug}");
    Ok(())
}

pub async fn handle_pull(
    client: &BroomvaClient,
    slug: &str,
    output: Option<&str>,
    json: bool,
) -> BroomvaResult<()> {
    // 1. Fetch the prompt detail first so we have the version for the beacon
    let prompt = client.get_prompt(slug).await?;
    let version = prompt
        .version
        .clone()
        .unwrap_or_else(|| "unknown".to_string());

    // 2. Fire the telemetry beacon — best-effort. The beacon prints a
    //    stderr warning on failure but never blocks the pull.
    let beacon = crate::telemetry::beacon::post_invocation_beacon(client, slug, &version).await;

    // 3. Write the prompt to disk (existing behavior preserved)
    let mut fm = std::collections::BTreeMap::new();
    fm.insert("title".into(), prompt.title.clone());
    fm.insert("slug".into(), prompt.slug.clone());
    if let Some(ref c) = prompt.category {
        fm.insert("category".into(), c.clone());
    }
    if let Some(ref m) = prompt.model {
        fm.insert("model".into(), m.clone());
    }
    if let Some(ref v) = prompt.visibility {
        fm.insert("visibility".into(), v.clone());
    }
    if let Some(ref tags) = prompt.tags {
        fm.insert("tags".into(), tags.join(", "));
    }

    let pf = frontmatter::PromptFile {
        frontmatter: fm,
        body: prompt.content,
    };
    let rendered = frontmatter::render(&pf);

    let default_name = format!("{slug}.md");
    let dest = output.unwrap_or(&default_name);
    fs::write(dest, &rendered)?;
    println!("  Saved to {dest}");

    // 4. Emit invocation id on stderr (machine-readable JSON if --json)
    if json {
        let line = serde_json::json!({
            "invocation_id": beacon.id,
            "prompt_slug": slug,
            "prompt_version": prompt.version,
            "posted": beacon.posted,
        });
        eprintln!("{line}");
    } else {
        eprintln!("\n[broomva] invocation: {}", beacon.id);
    }

    Ok(())
}

pub async fn handle_push(
    client: &BroomvaClient,
    file: &str,
    create: bool,
    format: OutputFormat,
) -> BroomvaResult<()> {
    let path = Path::new(file);
    if !path.exists() {
        return Err(BroomvaError::User(format!("file not found: {file}")));
    }

    let content = fs::read_to_string(path)?;
    let pf = frontmatter::parse(&content);

    let title = pf.frontmatter.get("title").cloned().unwrap_or_else(|| {
        path.file_stem()
            .unwrap_or_default()
            .to_string_lossy()
            .into()
    });
    let slug = pf.frontmatter.get("slug").cloned();
    let category = pf.frontmatter.get("category").cloned();
    let model = pf.frontmatter.get("model").cloned();
    let visibility = pf.frontmatter.get("visibility").cloned();
    let tags = pf
        .frontmatter
        .get("tags")
        .map(|t| t.split(',').map(|s| s.trim().to_string()).collect());

    if create {
        let req = CreatePromptRequest {
            title,
            content: pf.body,
            summary: pf.frontmatter.get("summary").cloned(),
            category,
            model,
            version: pf.frontmatter.get("version").cloned(),
            tags,
            variables: None,
            links: None,
            visibility,
        };
        let prompt = client.create_prompt(req).await?;
        if format == OutputFormat::Json {
            print_json(&prompt);
        } else {
            println!("  Created prompt: {}", prompt.slug);
        }
    } else {
        let slug = slug.ok_or_else(|| {
            BroomvaError::User("slug required in frontmatter for update (or use --create)".into())
        })?;
        let req = UpdatePromptRequest {
            title: Some(title),
            content: Some(pf.body),
            summary: pf.frontmatter.get("summary").cloned(),
            category,
            model,
            version: pf.frontmatter.get("version").cloned(),
            tags,
            variables: None,
            links: None,
            visibility,
        };
        let prompt = client.update_prompt(&slug, req).await?;
        if format == OutputFormat::Json {
            print_json(&prompt);
        } else {
            println!("  Updated prompt: {}", prompt.slug);
        }
    }

    Ok(())
}

#[allow(clippy::too_many_arguments)]
pub async fn handle_complete(
    client: &BroomvaClient,
    invocation_id: &str,
    status: &str,
    model: Option<&str>,
    latency_ms: Option<i64>,
    tokens_in: Option<i64>,
    tokens_out: Option<i64>,
    error_message: Option<&str>,
    format: OutputFormat,
) -> BroomvaResult<()> {
    // Local validation: failed status MUST have an error_message
    if status == "failed" && error_message.is_none() {
        return Err(BroomvaError::User(
            "--error-message required when --status=failed".into(),
        ));
    }

    let req = crate::api::types::InvocationUpdateRequest {
        status: status.to_string(),
        model: model.map(|s| s.to_string()),
        latency_ms,
        tokens_in,
        tokens_out,
        error_message: error_message.map(|s| s.to_string()),
    };

    let row = client.update_invocation(invocation_id, &req).await?;

    if format == OutputFormat::Json {
        print_json(&row);
    } else {
        println!("  Completed invocation: {} ({})", row.id, row.status);
        if let Some(cost) = row.cost_usd {
            println!("    cost: ${cost:.6}");
        }
    }
    Ok(())
}

pub async fn handle_feedback(
    client: &BroomvaClient,
    invocation_id: Option<&str>,
    slug: Option<&str>,
    version: &str,
    signal: &str,
    text: Option<&str>,
    format: OutputFormat,
) -> BroomvaResult<()> {
    // Resolve the slug. For attached feedback (with invocation_id), --slug
    // is currently required because there's no GET /api/invocations/[id]
    // endpoint exposed in the CLI yet (Phase 2.1 follow-up). For detached
    // feedback, --slug is mandatory.
    let resolved_slug = match (invocation_id, slug) {
        (Some(_id), Some(s)) => s.to_string(),
        (Some(id), None) => {
            return Err(BroomvaError::User(format!(
                "feedback on invocation {id} requires --slug (detached lookup not yet wired)"
            )));
        }
        (None, Some(s)) => s.to_string(),
        (None, None) => {
            return Err(BroomvaError::User(
                "either invocation_id or --slug is required".into(),
            ));
        }
    };

    let normalized_signal = match signal {
        "up" => "thumbs_up",
        "down" => "thumbs_down",
        other => {
            return Err(BroomvaError::User(format!(
                "invalid signal {other} (use up|down)"
            )));
        }
    };

    let req = crate::api::types::FeedbackCreateRequest {
        invocation_id: invocation_id.map(|s| s.to_string()),
        prompt_slug: resolved_slug,
        prompt_version: version.to_string(),
        signal: normalized_signal.to_string(),
        text: text.map(|s| s.to_string()),
        source: crate::telemetry::source::detect_source()
            .as_str()
            .to_string(),
    };

    let resp = client.create_feedback(&req).await?;
    if format == OutputFormat::Json {
        print_json(&resp);
    } else {
        println!("  Recorded feedback: {} ({})", resp.id, normalized_signal);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::telemetry::TELEMETRY_ENV_LOCK;
    use tempfile::tempdir;
    use wiremock::matchers::{method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    /// RAII guard that restores an env var on drop — panic-safe so a failing
    /// assertion can't leak state into sibling tests.
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
    async fn pull_fires_telemetry_beacon_after_get() {
        // Tokio test runs on a single-threaded runtime; holding the lock
        // across awaits serializes tests that touch BROOMVA_* env vars
        // without risking deadlock on another worker thread.
        let _env_guard = TELEMETRY_ENV_LOCK.lock().unwrap();
        let session_tmp = tempdir().unwrap();
        let session_path = session_tmp.path().join("session");
        let _session_guard = EnvGuard::set("BROOMVA_SESSION_PATH", &session_path.to_string_lossy());

        let server = MockServer::start().await;
        // Server emits a bare PromptDetail (no { data } wrapper) since the
        // Phase 2.1 envelope-mismatch fix.
        Mock::given(method("GET"))
            .and(path("/api/prompts/code-review-agent"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "id": "u1",
                "slug": "code-review-agent",
                "title": "Code Review Agent",
                "content": "system prompt body",
                "summary": "Structured code review",
                "category": "system-prompts",
                "model": "claude-sonnet-4.5",
                "tags": ["code-review"],
                "visibility": "public",
                "createdAt": "2026-05-09T00:00:00Z",
                "updatedAt": "2026-05-09T00:00:00Z"
            })))
            .mount(&server)
            .await;
        Mock::given(method("POST"))
            .and(path("/api/invocations"))
            .respond_with(ResponseTemplate::new(201).set_body_json(serde_json::json!({
                "id": "ignored",
                "created_at": "2026-05-11T00:00:00Z"
            })))
            .mount(&server)
            .await;

        let client = BroomvaClient::new(server.uri(), None);
        let tmp = tempdir().unwrap();
        let dest = tmp.path().join("out.md");
        let result = handle_pull(
            &client,
            "code-review-agent",
            Some(dest.to_str().unwrap()),
            false,
        )
        .await;
        assert!(result.is_ok(), "{result:?}");
        let written = std::fs::read_to_string(&dest).unwrap();
        assert!(written.contains("Code Review Agent"));
    }

    #[tokio::test]
    #[allow(clippy::await_holding_lock)]
    async fn pull_with_telemetry_disabled_still_writes_file() {
        let _env_guard = TELEMETRY_ENV_LOCK.lock().unwrap();
        let session_tmp = tempdir().unwrap();
        let session_path = session_tmp.path().join("session");
        let _session_guard = EnvGuard::set("BROOMVA_SESSION_PATH", &session_path.to_string_lossy());
        // BROOMVA_TELEMETRY_DISABLED is read fresh in
        // beacon::post_invocation_beacon so the disable takes effect
        // immediately. The guard restores the var on drop — panic-safe.
        let _disabled_guard = EnvGuard::set("BROOMVA_TELEMETRY_DISABLED", "1");

        let server = MockServer::start().await;
        // Server emits a bare PromptDetail (no { data } wrapper).
        Mock::given(method("GET"))
            .and(path("/api/prompts/x"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "id": "u1",
                "slug": "x",
                "title": "X",
                "content": "body",
                "tags": [],
                "visibility": "public"
            })))
            .mount(&server)
            .await;
        // No mock for POST /api/invocations — with telemetry disabled,
        // no POST should land at all.

        let client = BroomvaClient::new(server.uri(), None);
        let tmp = tempdir().unwrap();
        let dest = tmp.path().join("out.md");
        let result = handle_pull(&client, "x", Some(dest.to_str().unwrap()), false).await;
        assert!(result.is_ok(), "{result:?}");
    }

    #[tokio::test]
    #[allow(clippy::await_holding_lock)]
    async fn complete_with_pass_status_calls_patch() {
        let _env_guard = crate::telemetry::TELEMETRY_ENV_LOCK.lock().unwrap();

        let server = MockServer::start().await;
        Mock::given(method("PATCH"))
            .and(path("/api/invocations/abc-123"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
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
                "latency_ms": 1000,
                "tokens_in": 100,
                "tokens_out": 50,
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

        let client = BroomvaClient::new(server.uri(), None);
        let result = handle_complete(
            &client,
            "abc-123",
            "completed",
            Some("claude-sonnet-4.5"),
            Some(1000),
            Some(100),
            Some(50),
            None,
            crate::cli::output::OutputFormat::Table,
        )
        .await;
        assert!(result.is_ok(), "{result:?}");
    }

    #[tokio::test]
    #[allow(clippy::await_holding_lock)]
    async fn complete_failed_without_error_message_rejects_locally() {
        let _env_guard = crate::telemetry::TELEMETRY_ENV_LOCK.lock().unwrap();

        let server = MockServer::start().await;
        // No mock needed — the rejection should happen before any HTTP call
        let client = BroomvaClient::new(server.uri(), None);
        let result = handle_complete(
            &client,
            "abc-123",
            "failed",
            None,
            None,
            None,
            None,
            None,
            crate::cli::output::OutputFormat::Table,
        )
        .await;
        assert!(result.is_err());
    }

    #[tokio::test]
    #[allow(clippy::await_holding_lock)]
    async fn feedback_attached_with_slug_posts() {
        let _env_guard = crate::telemetry::TELEMETRY_ENV_LOCK.lock().unwrap();

        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/api/feedback"))
            .respond_with(ResponseTemplate::new(201).set_body_json(serde_json::json!({
                "id": "fb-1",
                "created_at": "2026-05-11T00:00:00Z"
            })))
            .mount(&server)
            .await;

        let client = BroomvaClient::new(server.uri(), None);
        let result = handle_feedback(
            &client,
            Some("abc-123"),
            Some("x"),
            "1.0",
            "up",
            Some("nice"),
            crate::cli::output::OutputFormat::Table,
        )
        .await;
        assert!(result.is_ok(), "{result:?}");
    }

    #[tokio::test]
    #[allow(clippy::await_holding_lock)]
    async fn feedback_detached_no_slug_rejects_locally() {
        let _env_guard = crate::telemetry::TELEMETRY_ENV_LOCK.lock().unwrap();

        let server = MockServer::start().await;
        let client = BroomvaClient::new(server.uri(), None);
        let result = handle_feedback(
            &client,
            None,
            None,
            "1.0",
            "down",
            None,
            crate::cli::output::OutputFormat::Table,
        )
        .await;
        assert!(result.is_err());
    }

    #[tokio::test]
    #[allow(clippy::await_holding_lock)]
    async fn list_with_metrics_renders_extra_columns() {
        let _env_guard = crate::telemetry::TELEMETRY_ENV_LOCK.lock().unwrap();

        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/api/prompts"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!([
                {
                    "slug": "code-review-agent",
                    "title": "Code Review Agent",
                    "category": "system-prompts",
                    "model": "claude-sonnet-4.5",
                    "visibility": "public",
                    "metrics": {
                        "copies": 42,
                        "cli_pulls": 8,
                        "skill_invokes": 100,
                        "traces": 150,
                        "runs_7d": 30
                    }
                }
            ])))
            .mount(&server)
            .await;

        let client = BroomvaClient::new(server.uri(), None);
        let result = handle_list(
            &client,
            None,
            None,
            None,
            false,
            true,
            Some("skill_invokes"),
            crate::cli::output::OutputFormat::Table,
        )
        .await;
        assert!(result.is_ok(), "{result:?}");
    }
}
