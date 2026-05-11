use std::fs;
use std::path::Path;

use crate::api::BroomvaClient;
use crate::api::types::{CreatePromptRequest, UpdatePromptRequest};
use crate::cli::output::{OutputFormat, print_json, print_kv, print_table};
use crate::error::{BroomvaError, BroomvaResult};
use crate::frontmatter;

pub async fn handle_list(
    client: &BroomvaClient,
    category: Option<&str>,
    tag: Option<&str>,
    model: Option<&str>,
    mine: bool,
    format: OutputFormat,
) -> BroomvaResult<()> {
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
    let beacon =
        crate::telemetry::beacon::post_invocation_beacon(client, slug, &version).await;

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
        let _session_guard =
            EnvGuard::set("BROOMVA_SESSION_PATH", &session_path.to_string_lossy());

        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/api/prompts/code-review-agent"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "data": {
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
                }
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
        let result = handle_pull(&client, "code-review-agent", Some(dest.to_str().unwrap()), false).await;
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
        let _session_guard =
            EnvGuard::set("BROOMVA_SESSION_PATH", &session_path.to_string_lossy());
        // BROOMVA_TELEMETRY_DISABLED is read fresh in
        // beacon::post_invocation_beacon so the disable takes effect
        // immediately. The guard restores the var on drop — panic-safe.
        let _disabled_guard = EnvGuard::set("BROOMVA_TELEMETRY_DISABLED", "1");

        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/api/prompts/x"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "data": {
                    "id": "u1",
                    "slug": "x",
                    "title": "X",
                    "content": "body",
                    "tags": [],
                    "visibility": "public"
                }
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
}
