//! `broomva docs` — publish agent-authored HTML documents to a stable,
//! owner-gated URL (`<base>/d/<id>`) and manage them. BRO-1293.
//!
//! The document is stored server-side as data (no PR / deploy on the critical
//! path), so the URL is live in seconds and openable from a phone that is
//! already logged into broomva.tech. Ownership is the authenticated identity
//! behind the Bearer token; viewing is owner-gated.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command as ProcessCommand;

use crate::api::BroomvaClient;
use crate::api::types::{DocSource, PublishDocRequest};
use crate::cli::output::{OutputFormat, print_json, print_kv, print_table};
use crate::error::{BroomvaError, BroomvaResult};

/// Publish a local HTML file. Prints the gated URL.
pub async fn handle_publish(
    client: &BroomvaClient,
    file: &str,
    title: Option<String>,
    commit: bool,
    open: bool,
    format: OutputFormat,
) -> BroomvaResult<()> {
    let path = Path::new(file);
    if !path.exists() {
        return Err(BroomvaError::User(format!("file not found: {file}")));
    }
    // Fail fast on oversize before reading/uploading (server caps at ~2 MB).
    const MAX_BYTES: u64 = 2_000_000;
    if let Ok(meta) = fs::metadata(path)
        && meta.len() > MAX_BYTES
    {
        return Err(BroomvaError::User(format!(
            "file too large: {} bytes (max {MAX_BYTES}). The server rejects documents over ~2 MB.",
            meta.len()
        )));
    }
    let html = fs::read_to_string(path)?;

    // Title precedence: explicit --title → <title> tag → file stem.
    // (If none resolve, the server derives one from <title>/<h1>.)
    let resolved_title = title
        .map(|t| t.trim().to_string())
        .filter(|t| !t.is_empty())
        .or_else(|| extract_html_title(&html))
        .or_else(|| {
            path.file_stem()
                .map(|s| s.to_string_lossy().into_owned())
        });

    // git archival: --commit stages + commits the file first, so the recorded
    // HEAD is the commit that contains it.
    if commit {
        commit_file(path)?;
    }

    // Provenance — recorded even without --commit (best-effort).
    let source = detect_git_source(path).filter(|s| !s.is_empty());

    let req = PublishDocRequest {
        title: resolved_title,
        html,
        source,
    };
    let resp = client.publish_doc(req).await?;

    if format == OutputFormat::Json {
        print_json(&resp);
    } else {
        print_kv("Published", &resp.title);
        print_kv("URL", &resp.url);
    }

    if open {
        // Best-effort; don't fail the publish if the browser can't open.
        let _ = open_url(&resp.url);
    }
    Ok(())
}

/// List the owner's published docs.
pub async fn handle_list(client: &BroomvaClient, format: OutputFormat) -> BroomvaResult<()> {
    let docs = client.list_docs().await?;

    if format == OutputFormat::Json {
        print_json(&docs);
        return Ok(());
    }
    if docs.is_empty() {
        println!("No documents yet. Publish one with `broomva docs publish file.html`.");
        return Ok(());
    }

    let rows: Vec<Vec<String>> = docs
        .iter()
        .map(|d| {
            vec![
                d.id.clone(),
                d.title.clone(),
                d.created_at.clone(),
                d.url.clone(),
            ]
        })
        .collect();
    print_table(&["ID", "TITLE", "CREATED", "URL"], &rows, format);
    Ok(())
}

/// Open a doc's gated URL in the default browser.
pub async fn handle_open(client: &BroomvaClient, id: &str) -> BroomvaResult<()> {
    let url = format!("{}/d/{}", client.base_url().trim_end_matches('/'), id);
    open_url(&url)?;
    println!("Opening {url}");
    Ok(())
}

/// Delete an owned doc.
pub async fn handle_rm(client: &BroomvaClient, id: &str) -> BroomvaResult<()> {
    client.delete_doc(id).await?;
    println!("Deleted {id}");
    Ok(())
}

/// Extract the first `<title>…</title>` text (case-insensitive). Returns None
/// when absent or empty.
fn extract_html_title(html: &str) -> Option<String> {
    let lower = html.to_ascii_lowercase();
    let open = lower.find("<title")?;
    let content_start = lower[open..].find('>')? + open + 1;
    let close = lower[content_start..].find("</title>")? + content_start;
    let title = html[content_start..close].trim();
    if title.is_empty() {
        None
    } else {
        Some(title.chars().take(300).collect())
    }
}

/// Directory to run git from (the file's parent, or cwd).
fn parent_dir(path: &Path) -> PathBuf {
    path.parent()
        .filter(|p| !p.as_os_str().is_empty())
        .map(Path::to_path_buf)
        .unwrap_or_else(|| PathBuf::from("."))
}

/// Run a git subcommand in `dir`, returning trimmed stdout on success.
fn git_capture(dir: &Path, args: &[&str]) -> Option<String> {
    let out = ProcessCommand::new("git")
        .args(args)
        .current_dir(dir)
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if s.is_empty() { None } else { Some(s) }
}

/// Best-effort git provenance: origin remote, repo-root-relative path, HEAD sha.
fn detect_git_source(path: &Path) -> Option<DocSource> {
    let dir = parent_dir(path);
    let repo = git_capture(&dir, &["remote", "get-url", "origin"]);
    let commit = git_capture(&dir, &["rev-parse", "HEAD"]);
    let toplevel = git_capture(&dir, &["rev-parse", "--show-toplevel"]);

    let rel_path = match (toplevel, path.canonicalize().ok()) {
        (Some(top), Some(abs)) => Path::new(&top)
            .canonicalize()
            .ok()
            .and_then(|top_abs| {
                abs.strip_prefix(&top_abs)
                    .ok()
                    .map(|p| p.to_string_lossy().into_owned())
            }),
        _ => None,
    };

    let source = DocSource {
        repo,
        path: rel_path,
        commit,
    };
    if source.is_empty() {
        None
    } else {
        Some(source)
    }
}

/// Stage + commit a single file (git archival). Errors if git fails.
fn commit_file(path: &Path) -> BroomvaResult<()> {
    let dir = parent_dir(path);
    let file_name = path
        .file_name()
        .map(|f| f.to_string_lossy().into_owned())
        .ok_or_else(|| BroomvaError::User("invalid file path".into()))?;

    let added = ProcessCommand::new("git")
        .args(["add", "--", &file_name])
        .current_dir(&dir)
        .status()?;
    if !added.success() {
        return Err(BroomvaError::User(format!("`git add {file_name}` failed")));
    }

    let message = format!("docs: publish {file_name}");
    let committed = ProcessCommand::new("git")
        .args(["commit", "-m", &message, "--", &file_name])
        .current_dir(&dir)
        .status()?;
    if !committed.success() {
        return Err(BroomvaError::User(
            "`git commit` failed (nothing to commit, or not a git repo)".into(),
        ));
    }
    Ok(())
}

/// Open a URL in the platform default browser.
fn open_url(url: &str) -> BroomvaResult<()> {
    #[cfg(target_os = "macos")]
    let program = "open";
    #[cfg(all(unix, not(target_os = "macos")))]
    let program = "xdg-open";
    #[cfg(target_os = "windows")]
    let program = "explorer";

    ProcessCommand::new(program).arg(url).status()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_plain_title() {
        let html = "<html><head><title>My Spec</title></head><body>x</body></html>";
        assert_eq!(extract_html_title(html).as_deref(), Some("My Spec"));
    }

    #[test]
    fn title_is_case_insensitive_and_trimmed() {
        assert_eq!(
            extract_html_title("<TITLE>  Spaced  </TITLE>").as_deref(),
            Some("Spaced"),
        );
    }

    #[test]
    fn title_with_attributes() {
        assert_eq!(
            extract_html_title(r#"<title data-x="1">Attr Title</title>"#).as_deref(),
            Some("Attr Title"),
        );
    }

    #[test]
    fn missing_title_is_none() {
        assert_eq!(extract_html_title("<html><body>hi</body></html>"), None);
    }

    #[test]
    fn empty_title_is_none() {
        assert_eq!(extract_html_title("<title>   </title>"), None);
    }

    #[test]
    fn empty_doc_source_detected() {
        let src = DocSource::default();
        assert!(src.is_empty());
        let src = DocSource {
            commit: Some("abc".into()),
            ..Default::default()
        };
        assert!(!src.is_empty());
    }
}
