use std::fs;
use std::io;
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
    let resp = client.create_prompt(req).await?;
    surface_mirror_warning(
        &resp.prompt,
        resp.warning_header.as_deref(),
        &mut io::stderr(),
    );

    if format == OutputFormat::Json {
        print_json(&resp.prompt);
    } else {
        println!("  Created prompt: {}", resp.prompt.slug);
    }
    Ok(())
}

pub async fn handle_update(
    client: &BroomvaClient,
    slug: &str,
    req: UpdatePromptRequest,
    format: OutputFormat,
) -> BroomvaResult<()> {
    let resp = client.update_prompt(slug, req).await?;
    surface_mirror_warning(
        &resp.prompt,
        resp.warning_header.as_deref(),
        &mut io::stderr(),
    );

    if format == OutputFormat::Json {
        print_json(&resp.prompt);
    } else {
        println!("  Updated prompt: {}", resp.prompt.slug);
    }
    Ok(())
}

/// BRO-1183: classify the warning signal the server attached to an admin
/// POST/PUT response. Returns the detail text the CLI should surface, or
/// `None` when no mirror-failure signal is present.
///
/// Precedence:
/// - body field present + ok=false  → return body's error message (most accurate)
/// - body field present + ok=true   → success, return None
/// - body field absent, header present → scan every comma-separated warn-value
///   in the header for one whose quoted text starts with
///   `GitHub mirror failed: `; ignore the rest (other 199-warnings or non-
///   mirror RFC warnings are not mis-attributed).
/// - both absent → None
fn classify_mirror_warning(
    prompt: &crate::api::types::PromptDetail,
    warning_header: Option<&str>,
) -> Option<String> {
    const MIRROR_PREFIX: &str = "GitHub mirror failed: ";

    if let Some(status) = prompt.github_mirror.as_ref() {
        if status.ok {
            return None;
        }
        let detail = status
            .error
            .clone()
            .unwrap_or_else(|| "(no error message from server)".to_string());
        return Some(detail);
    }
    let header = warning_header?;
    parse_warning_detail(header)
        .into_iter()
        .find_map(|text| text.strip_prefix(MIRROR_PREFIX).map(str::to_string))
}

/// BRO-1183: emit a stderr warning when [`classify_mirror_warning`] returns
/// a mirror-failure detail. The success path is unchanged — this writes
/// ADDITIONAL stderr lines, never replacing the prompt summary on stdout.
///
/// Takes the sink as a generic `Write` so tests can capture stderr without
/// shelling out. Errors writing to the sink are intentionally ignored —
/// surfacing a warning is best-effort.
fn surface_mirror_warning<W: io::Write>(
    prompt: &crate::api::types::PromptDetail,
    warning_header: Option<&str>,
    sink: &mut W,
) {
    let Some(detail) = classify_mirror_warning(prompt, warning_header) else {
        return;
    };
    let _ = writeln!(sink, "[broomva] WARNING: GitHub mirror failed: {detail}");
    let _ = writeln!(
        sink,
        "[broomva]   The prompt was saved to the database but did NOT reach the public broomva.tech page."
    );
}

/// Best-effort: extract every quoted `<text>` from a (possibly multi-value)
/// `Warning` header per RFC 7234 §5.5. Each warn-value has the shape
/// `<warn-code> <warn-agent> "<text>" [<warn-date>]`, and a single header
/// may carry several warn-values separated by `,`. `extract_warning_header`
/// joins multiple `Warning` headers with `, ` so this parser handles both
/// shapes uniformly.
///
/// Returns an empty Vec if no `199` warn-values match — the caller treats
/// that as "no mirror signal" rather than mis-attributing other warn-codes.
fn parse_warning_detail(header: &str) -> Vec<&str> {
    let mut out = Vec::new();
    let mut cursor = header;
    while !cursor.is_empty() {
        cursor = cursor.trim_start_matches([' ', '\t', ',']);
        if cursor.is_empty() {
            break;
        }
        // Strip `199 -` (or any RFC `<3-digit-code> <agent>`) up to the
        // opening quote. We only care about the 199 case for mirror
        // failures; other codes are non-fatal to skip.
        let Some(rest) = cursor.strip_prefix("199") else {
            // Not a 199 — skip past the next `,` separator (if any).
            match find_warn_value_boundary(cursor) {
                Some(next) => cursor = &cursor[next..],
                None => break,
            }
            continue;
        };
        let after_agent = rest.trim_start();
        let after_dash = match after_agent.strip_prefix('-') {
            Some(s) => s.trim_start(),
            None => after_agent, // tolerate `199 "text"` without the dash
        };
        let Some(inside) = after_dash.strip_prefix('"') else {
            // Malformed — bail out of this warn-value, look for the next.
            match find_warn_value_boundary(after_dash) {
                Some(next) => cursor = &after_dash[next..],
                None => break,
            }
            continue;
        };
        let Some(end) = inside.find('"') else {
            break; // unterminated quote — abandon parsing
        };
        out.push(&inside[..end]);
        cursor = &inside[end + 1..];
        // Skip the optional warn-date and the comma to the next warn-value.
        match find_warn_value_boundary(cursor) {
            Some(next) => cursor = &cursor[next..],
            None => break,
        }
    }
    out
}

/// Find the byte index immediately past the next `,` warn-value separator,
/// or None if there is no further warn-value. Used to skip past optional
/// warn-date tokens and malformed values.
fn find_warn_value_boundary(s: &str) -> Option<usize> {
    s.find(',').map(|i| i + 1)
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
    handle_push_with_sink(client, file, create, format, &mut io::stderr()).await
}

/// BRO-1183: testable form of [`handle_push`] that accepts an explicit sink
/// for the operator-facing GitHub-mirror warning. Production code calls the
/// public `handle_push` which delegates here with `io::stderr()`; tests pass
/// a `Vec<u8>` sink to assert the warning actually reaches the user.
async fn handle_push_with_sink<W: io::Write>(
    client: &BroomvaClient,
    file: &str,
    create: bool,
    format: OutputFormat,
    stderr_sink: &mut W,
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
        let resp = client.create_prompt(req).await?;
        surface_mirror_warning(&resp.prompt, resp.warning_header.as_deref(), stderr_sink);
        if format == OutputFormat::Json {
            print_json(&resp.prompt);
        } else {
            println!("  Created prompt: {}", resp.prompt.slug);
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
        let resp = client.update_prompt(&slug, req).await?;
        surface_mirror_warning(&resp.prompt, resp.warning_header.as_deref(), stderr_sink);
        if format == OutputFormat::Json {
            print_json(&resp.prompt);
        } else {
            println!("  Updated prompt: {}", resp.prompt.slug);
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

    use crate::api::types::{GithubMirrorStatus, PromptDetail};

    fn make_prompt(github_mirror: Option<GithubMirrorStatus>) -> PromptDetail {
        PromptDetail {
            id: None,
            slug: "x".into(),
            title: "X".into(),
            content: "body".into(),
            summary: None,
            category: None,
            model: None,
            version: None,
            tags: None,
            visibility: None,
            created_at: None,
            updated_at: None,
            github_mirror,
        }
    }

    #[test]
    fn parse_warning_detail_extracts_rfc7234_text() {
        // BRO-1183: server emits `Warning: 199 - "GitHub mirror failed: ..."`.
        // The parser strips the envelope so the caller sees the inner string.
        let header = r#"199 - "GitHub mirror failed: GITHUB_TOKEN not set""#;
        assert_eq!(
            parse_warning_detail(header),
            vec!["GitHub mirror failed: GITHUB_TOKEN not set"]
        );
    }

    #[test]
    fn parse_warning_detail_returns_empty_on_garbage() {
        // Defensive: classifier checks each result against the mirror prefix
        // and stays silent if none match.
        assert!(parse_warning_detail("not a warning header").is_empty());
        assert!(parse_warning_detail("299 - \"non-cache warning\"").is_empty());
    }

    #[test]
    fn parse_warning_detail_handles_multi_value_header() {
        // BRO-1183 round 3: RFC 7234 §5.5 allows multiple warn-values per
        // header (comma-separated) and `extract_warning_header` joins
        // multiple `Warning` headers with `, ` too. Both shapes must
        // surface the mirror warn-value without false positives.
        let multi = r#"110 - "stale", 199 - "GitHub mirror failed: branch protection", 214 - "Transformation Applied""#;
        let values = parse_warning_detail(multi);
        assert!(
            values.iter().any(|v| v.starts_with("GitHub mirror failed")),
            "expected to find mirror warn-value among {values:?}"
        );
        // Non-199 values must be filtered, not surfaced verbatim.
        assert!(!values.iter().any(|v| v.contains("stale")));
        assert!(!values.iter().any(|v| v.contains("Transformation Applied")));
    }

    #[test]
    fn classify_mirror_warning_prefers_body_failure() {
        // Body field wins over header — it's the structured source.
        let prompt = make_prompt(Some(GithubMirrorStatus {
            ok: false,
            error: Some("from body".into()),
        }));
        let header = r#"199 - "GitHub mirror failed: from header""#;
        assert_eq!(
            classify_mirror_warning(&prompt, Some(header)).as_deref(),
            Some("from body")
        );
    }

    #[test]
    fn classify_mirror_warning_silent_when_body_ok() {
        // Body says ok=true — header is ignored even if present (the body is
        // the source of truth; mixed signals get resolved in favor of the body).
        let prompt = make_prompt(Some(GithubMirrorStatus {
            ok: true,
            error: None,
        }));
        assert!(classify_mirror_warning(&prompt, None).is_none());
        assert!(classify_mirror_warning(&prompt, Some(r#"199 - "x""#)).is_none());
    }

    #[test]
    fn classify_mirror_warning_falls_back_to_header_for_old_servers() {
        // No body field — older server. Only accept the header if it carries
        // the mirror-specific prefix; otherwise stay silent rather than
        // mis-attributing an unrelated 199 warning to the mirror feature.
        let prompt = make_prompt(None);
        let mirror_header = r#"199 - "GitHub mirror failed: branch protection""#;
        assert_eq!(
            classify_mirror_warning(&prompt, Some(mirror_header)).as_deref(),
            Some("branch protection")
        );
        let unrelated_header = r#"199 - "some other server warning""#;
        assert!(
            classify_mirror_warning(&prompt, Some(unrelated_header)).is_none(),
            "non-mirror 199-warnings must not be mis-attributed"
        );
    }

    #[test]
    fn classify_mirror_warning_handles_missing_error_message() {
        // Body says ok=false but no error string — surface a placeholder
        // rather than silently dropping the failure signal.
        let prompt = make_prompt(Some(GithubMirrorStatus {
            ok: false,
            error: None,
        }));
        let detail = classify_mirror_warning(&prompt, None).expect("classified");
        assert!(detail.contains("no error message"));
    }

    #[test]
    fn surface_mirror_warning_writes_two_lines_on_failure() {
        // BRO-1183 user-visible contract: stderr gets the WARNING line + a
        // follow-up explaining what happened to the prompt.
        let prompt = make_prompt(Some(GithubMirrorStatus {
            ok: false,
            error: Some("GITHUB_TOKEN not set".into()),
        }));
        let mut buf: Vec<u8> = Vec::new();
        surface_mirror_warning(&prompt, None, &mut buf);
        let out = String::from_utf8(buf).unwrap();
        assert!(
            out.contains("WARNING: GitHub mirror failed: GITHUB_TOKEN not set"),
            "stderr missing primary warning line: {out}"
        );
        assert!(
            out.contains("did NOT reach the public broomva.tech page"),
            "stderr missing explanation line: {out}"
        );
    }

    #[test]
    fn surface_mirror_warning_silent_on_success() {
        // No noise on the happy path — important for scripts that pipe
        // stderr to a log file and treat any output as an alert.
        let prompt = make_prompt(Some(GithubMirrorStatus {
            ok: true,
            error: None,
        }));
        let mut buf: Vec<u8> = Vec::new();
        surface_mirror_warning(&prompt, None, &mut buf);
        assert!(buf.is_empty());
    }

    #[tokio::test]
    #[allow(clippy::await_holding_lock)]
    async fn push_create_surfaces_mirror_failure_from_body() {
        // BRO-1183: POST /api/prompts returns 201 with body.githubMirror.ok=false.
        // The CLI MUST emit a warning to stderr and still print the created prompt.
        let _env_guard = TELEMETRY_ENV_LOCK.lock().unwrap();
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/api/prompts"))
            .respond_with(
                ResponseTemplate::new(201)
                    .insert_header(
                        "Warning",
                        r#"199 - "GitHub mirror failed: GITHUB_TOKEN not set""#,
                    )
                    .set_body_json(serde_json::json!({
                        "slug": "new-prompt",
                        "title": "New Prompt",
                        "content": "body",
                        "githubMirror": {
                            "ok": false,
                            "error": "GITHUB_TOKEN not set"
                        }
                    })),
            )
            .mount(&server)
            .await;

        let client = BroomvaClient::new(server.uri(), Some("token".into()));
        let req = CreatePromptRequest {
            title: "New Prompt".into(),
            content: "body".into(),
            summary: None,
            category: None,
            model: None,
            version: None,
            tags: None,
            variables: None,
            links: None,
            visibility: Some("public".into()),
        };
        let resp = client.create_prompt(req).await.unwrap();
        assert_eq!(resp.prompt.slug, "new-prompt");
        let mirror = resp.prompt.github_mirror.clone().expect("mirror present");
        assert!(!mirror.ok);
        assert_eq!(mirror.error.as_deref(), Some("GITHUB_TOKEN not set"));
        let warning = resp.warning_header.as_deref().expect("Warning header set");
        assert!(warning.contains("GitHub mirror failed"));

        // Verify the end-to-end stderr behavior the user actually sees.
        let mut buf: Vec<u8> = Vec::new();
        surface_mirror_warning(&resp.prompt, resp.warning_header.as_deref(), &mut buf);
        let stderr_text = String::from_utf8(buf).unwrap();
        assert!(stderr_text.contains("GITHUB_TOKEN not set"));
        assert!(stderr_text.contains("did NOT reach the public"));
    }

    #[tokio::test]
    #[allow(clippy::await_holding_lock)]
    async fn update_prompt_surfaces_mirror_warning_header_only() {
        // BRO-1183: older server that sets the Warning header but doesn't yet
        // emit the body.githubMirror field — the CLI MUST still surface the
        // warning via the header fallback. The classifier requires the mirror
        // prefix, so a non-mirror 199-warning would correctly stay silent.
        let _env_guard = TELEMETRY_ENV_LOCK.lock().unwrap();
        let server = MockServer::start().await;
        Mock::given(method("PUT"))
            .and(path("/api/prompts/x"))
            .respond_with(
                ResponseTemplate::new(200)
                    .insert_header(
                        "Warning",
                        r#"199 - "GitHub mirror failed: branch protection""#,
                    )
                    .set_body_json(serde_json::json!({
                        "slug": "x",
                        "title": "X",
                        "content": "body"
                    })),
            )
            .mount(&server)
            .await;

        let client = BroomvaClient::new(server.uri(), Some("token".into()));
        let req = UpdatePromptRequest {
            title: Some("X".into()),
            content: Some("body".into()),
            summary: None,
            category: None,
            model: None,
            version: None,
            tags: None,
            variables: None,
            links: None,
            visibility: None,
        };
        let resp = client.update_prompt("x", req).await.unwrap();
        assert!(
            resp.prompt.github_mirror.is_none(),
            "old server omits the field"
        );
        let warning = resp.warning_header.as_deref().expect("Warning header set");
        assert!(warning.contains("GitHub mirror failed: branch protection"));

        let mut buf: Vec<u8> = Vec::new();
        surface_mirror_warning(&resp.prompt, resp.warning_header.as_deref(), &mut buf);
        let stderr_text = String::from_utf8(buf).unwrap();
        assert!(stderr_text.contains("branch protection"));
    }

    #[tokio::test]
    #[allow(clippy::await_holding_lock)]
    async fn update_prompt_no_warning_when_mirror_ok() {
        // BRO-1183: success path — no Warning header, body.githubMirror.ok=true.
        let _env_guard = TELEMETRY_ENV_LOCK.lock().unwrap();
        let server = MockServer::start().await;
        Mock::given(method("PUT"))
            .and(path("/api/prompts/x"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "slug": "x",
                "title": "X",
                "content": "body",
                "githubMirror": { "ok": true }
            })))
            .mount(&server)
            .await;

        let client = BroomvaClient::new(server.uri(), Some("token".into()));
        let req = UpdatePromptRequest {
            title: Some("X".into()),
            content: Some("body".into()),
            summary: None,
            category: None,
            model: None,
            version: None,
            tags: None,
            variables: None,
            links: None,
            visibility: None,
        };
        let resp = client.update_prompt("x", req).await.unwrap();
        let mirror = resp.prompt.github_mirror.clone().expect("mirror present");
        assert!(mirror.ok);
        assert!(
            resp.warning_header.is_none(),
            "no Warning header on success"
        );

        let mut buf: Vec<u8> = Vec::new();
        surface_mirror_warning(&resp.prompt, resp.warning_header.as_deref(), &mut buf);
        assert!(buf.is_empty(), "success path must be stderr-silent");
    }

    #[tokio::test]
    #[allow(clippy::await_holding_lock)]
    async fn handle_push_writes_warning_to_stderr_sink_on_mirror_failure() {
        // BRO-1183 user-visible regression: drive `handle_push_with_sink`
        // end-to-end (read file → parse frontmatter → PUT → deserialize →
        // classify → write to sink) and assert the sink contains the
        // warning. If `surface_mirror_warning` is removed from the handler,
        // THIS test fails — that's the regression guard the user can rely on.
        let _env_guard = TELEMETRY_ENV_LOCK.lock().unwrap();
        let server = MockServer::start().await;
        Mock::given(method("PUT"))
            .and(path("/api/prompts/existing"))
            .respond_with(
                ResponseTemplate::new(200)
                    .insert_header("Warning", r#"199 - "GitHub mirror failed: rate-limited""#)
                    .set_body_json(serde_json::json!({
                        "slug": "existing",
                        "title": "Existing",
                        "content": "updated body",
                        "githubMirror": {
                            "ok": false,
                            "error": "rate-limited"
                        }
                    })),
            )
            .mount(&server)
            .await;

        let tmp = tempdir().unwrap();
        let file_path = tmp.path().join("existing.md");
        std::fs::write(
            &file_path,
            "---\nslug: existing\ntitle: Existing\n---\nupdated body\n",
        )
        .unwrap();

        let client = BroomvaClient::new(server.uri(), Some("token".into()));
        let mut sink: Vec<u8> = Vec::new();
        let result = handle_push_with_sink(
            &client,
            file_path.to_str().unwrap(),
            false,
            crate::cli::output::OutputFormat::Table,
            &mut sink,
        )
        .await;
        assert!(result.is_ok(), "handle_push failed: {result:?}");

        let stderr_text = String::from_utf8(sink).expect("ASCII sink");
        assert!(
            stderr_text.contains("WARNING: GitHub mirror failed: rate-limited"),
            "handler did not surface mirror failure to stderr sink: {stderr_text}"
        );
        assert!(
            stderr_text.contains("did NOT reach the public broomva.tech page"),
            "handler did not surface explanation line: {stderr_text}"
        );
    }

    #[tokio::test]
    #[allow(clippy::await_holding_lock)]
    async fn handle_push_keeps_stderr_silent_on_mirror_success() {
        // BRO-1183: the silent-on-success guarantee must hold for the full
        // handler too. If `surface_mirror_warning` stops gating on the
        // classifier result, THIS test fails.
        let _env_guard = TELEMETRY_ENV_LOCK.lock().unwrap();
        let server = MockServer::start().await;
        Mock::given(method("PUT"))
            .and(path("/api/prompts/existing"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "slug": "existing",
                "title": "Existing",
                "content": "updated body",
                "githubMirror": { "ok": true }
            })))
            .mount(&server)
            .await;

        let tmp = tempdir().unwrap();
        let file_path = tmp.path().join("existing.md");
        std::fs::write(
            &file_path,
            "---\nslug: existing\ntitle: Existing\n---\nupdated body\n",
        )
        .unwrap();

        let client = BroomvaClient::new(server.uri(), Some("token".into()));
        let mut sink: Vec<u8> = Vec::new();
        let result = handle_push_with_sink(
            &client,
            file_path.to_str().unwrap(),
            false,
            crate::cli::output::OutputFormat::Table,
            &mut sink,
        )
        .await;
        assert!(result.is_ok(), "handle_push failed: {result:?}");
        assert!(
            sink.is_empty(),
            "expected silent stderr on mirror success, got: {:?}",
            String::from_utf8_lossy(&sink)
        );
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
