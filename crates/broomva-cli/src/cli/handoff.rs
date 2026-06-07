//! `broomva handoff` — push narrative handoff docs onto the Maestro queue
//! (BRO-1415). Where `broomva docs publish` uploads an HTML *spec* to
//! `/d/<handle>`, `broomva handoff push <file.md>` pushes the *handoff* the
//! `/handoff` skill writes (TL;DR + P15 snapshot + first action) onto the queue
//! at `/maestro/queue`, related to the specs it references and run by the same
//! Copy/Continue fresh-session trigger.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command as ProcessCommand;

use chrono::Utc;

use crate::api::BroomvaClient;
use crate::api::types::{HandoffSource, PushHandoffRequest};
use crate::cli::handoff_frontmatter as fm;
use crate::cli::output::{OutputFormat, print_json, print_kv, print_table};
use crate::error::{BroomvaError, BroomvaResult};

/// Push a local markdown handoff → queues it, then writes the queue reference
/// back into the file's frontmatter (BRO-1418). Frontmatter supplies defaults
/// (`arc` / `specs` / `ticket` / `priority`); CLI flags override. The body sent
/// to the server is the narrative with any frontmatter stripped.
#[allow(clippy::too_many_arguments)]
pub async fn handle_push(
    client: &BroomvaClient,
    file: &str,
    title: Option<String>,
    slug: Option<String>,
    specs: Vec<String>,
    ticket: Option<String>,
    priority: Option<i64>,
    commit: bool,
    no_write_back: bool,
    format: OutputFormat,
) -> BroomvaResult<()> {
    let path = Path::new(file);
    if !path.exists() {
        return Err(BroomvaError::User(format!("file not found: {file}")));
    }
    // Fail fast on oversize before reading/uploading (server caps at ~1 MB).
    const MAX_BYTES: u64 = 1_000_000;
    if let Ok(meta) = fs::metadata(path)
        && meta.len() > MAX_BYTES
    {
        return Err(BroomvaError::User(format!(
            "file too large: {} bytes (max {MAX_BYTES}). The server rejects handoffs over ~1 MB.",
            meta.len()
        )));
    }

    let raw = fs::read_to_string(path)?;
    let parsed = fm::parse(&raw);
    let body = parsed.body.clone();
    let mut front = parsed.frontmatter;

    // Title precedence: explicit --title → first `# ` heading → file stem.
    let resolved_title = title
        .map(|t| t.trim().to_string())
        .filter(|t| !t.is_empty())
        .or_else(|| extract_h1_title(&body))
        .or_else(|| path.file_stem().map(|s| s.to_string_lossy().into_owned()));

    // Slug / specs / ticket / priority: CLI flag → frontmatter → derived.
    let resolved_slug = slug
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .or_else(|| fm::get_str(&front, "arc"))
        .or_else(|| fm::get_str(&front, "slug"));

    let mut spec_refs: Vec<String> = Vec::new();
    for s in specs
        .into_iter()
        .map(|s| s.trim().to_string())
        .chain(fm::get_seq_str(&front, "specs"))
    {
        if !s.is_empty() && !spec_refs.contains(&s) {
            spec_refs.push(s);
        }
    }

    let resolved_ticket = ticket
        .map(|t| t.trim().to_string())
        .filter(|t| !t.is_empty())
        .or_else(|| fm::get_str(&front, "ticket"));

    let resolved_priority = priority.or_else(|| fm::get_i64(&front, "priority"));

    let tldr = extract_tldr(&body);
    let first_action = extract_section(&body, "First action");

    // git archival: --commit stages + commits the file first.
    if commit {
        commit_file(path)?;
    }

    let mut source = detect_git_source(path).unwrap_or_default();
    if let Some(t) = resolved_ticket.clone() {
        source.ticket = Some(t);
    }
    let source = if source.is_empty() {
        None
    } else {
        Some(source)
    };

    let req = PushHandoffRequest {
        title: resolved_title,
        body, // narrative only (frontmatter stripped)
        slug: resolved_slug.clone(),
        tldr,
        first_action,
        spec_refs: spec_refs.clone(),
        priority: resolved_priority,
        source,
    };
    let resp = client.push_handoff(req).await?;

    // Write the queue reference back into the file's frontmatter — the `.md`
    // becomes self-referential to its queue entry (re-push updates it).
    if !no_write_back {
        if let Some(s) = resp.slug.clone().or(resolved_slug) {
            fm::set_str(&mut front, "arc", &s);
        }
        if !spec_refs.is_empty() {
            fm::set_seq_str(&mut front, "specs", &spec_refs);
        }
        if let Some(t) = resolved_ticket {
            fm::set_str(&mut front, "ticket", &t);
        }
        if let Some(p) = resolved_priority {
            fm::set_i64(&mut front, "priority", p);
        }
        fm::set_str(&mut front, "queue_id", &resp.id);
        if let Some(s) = resp.slug.clone() {
            fm::set_str(&mut front, "queue_slug", &s);
        }
        fm::set_i64(&mut front, "queue_version", resp.version);
        fm::set_str(&mut front, "queue_status", &resp.status);
        fm::set_str(&mut front, "queue_url", &resp.url);
        if let Some(ts) = resp.created_at.clone() {
            fm::set_str(&mut front, "pushed_at", &ts);
        }
        fs::write(path, fm::render(&front, &parsed.body))?;
    }

    if format == OutputFormat::Json {
        print_json(&resp);
    } else {
        print_kv("Queued", &resp.title);
        if resp.version > 1 {
            print_kv("Version", &format!("v{}", resp.version));
        }
        if !resp.spec_refs.is_empty() {
            print_kv("Specs", &resp.spec_refs.join(", "));
        }
        if !no_write_back {
            print_kv("Frontmatter", "updated (queue_id, queue_status, …)");
        }
        print_kv("Queue", &resp.url);
    }
    Ok(())
}

/// List the owner's active queue.
pub async fn handle_list(client: &BroomvaClient, format: OutputFormat) -> BroomvaResult<()> {
    let rows = client.list_handoffs().await?;

    if format == OutputFormat::Json {
        print_json(&rows);
        return Ok(());
    }
    if rows.is_empty() {
        println!("Queue is empty. Push one with `broomva handoff push file.md`.");
        return Ok(());
    }

    let rows: Vec<Vec<String>> = rows
        .iter()
        .map(|h| {
            vec![
                h.slug.clone().unwrap_or_else(|| h.id.clone()),
                h.status.clone(),
                format!("{}", h.spec_refs.len()),
                h.ticket_id.clone().unwrap_or_default(),
                h.title.clone(),
            ]
        })
        .collect();
    print_table(
        &["SLUG", "STATUS", "SPECS", "TICKET", "TITLE"],
        &rows,
        format,
    );
    Ok(())
}

/// Resolve a lifecycle target that is either a handoff id or a path to a
/// handoff file (whose frontmatter carries `queue_id`). Returns (id, file).
fn resolve_target(target: &str) -> BroomvaResult<(String, Option<PathBuf>)> {
    let path = Path::new(target);
    if path.is_file() {
        let parsed = fm::parse(&fs::read_to_string(path)?);
        let id = fm::get_str(&parsed.frontmatter, "queue_id").ok_or_else(|| {
            BroomvaError::User(format!(
                "{target} has no `queue_id` in its frontmatter — run `broomva handoff push` first"
            ))
        })?;
        Ok((id, Some(path.to_path_buf())))
    } else {
        Ok((target.to_string(), None))
    }
}

/// Write a new `queue_status` into a handoff file's frontmatter.
fn write_back_status(path: &Path, status: &str) -> BroomvaResult<()> {
    let parsed = fm::parse(&fs::read_to_string(path)?);
    let mut front = parsed.frontmatter;
    fm::set_str(&mut front, "queue_status", status);
    fs::write(path, fm::render(&front, &parsed.body))?;
    Ok(())
}

/// Write public-sharing fields into a handoff file's frontmatter.
fn write_back_visibility(
    path: &Path,
    visibility: &str,
    public_url: Option<&str>,
) -> BroomvaResult<()> {
    let parsed = fm::parse(&fs::read_to_string(path)?);
    let mut front = parsed.frontmatter;
    fm::set_str(&mut front, "visibility", visibility);
    match public_url {
        Some(url) => {
            fm::set_str(&mut front, "public_url", url);
            fm::remove(&mut front, "unpublished_at");
        }
        None => {
            fm::remove(&mut front, "public_url");
            fm::set_str(&mut front, "unpublished_at", &Utc::now().to_rfc3339());
        }
    }
    fs::write(path, fm::render(&front, &parsed.body))?;
    Ok(())
}

/// Apply a queue transition by `<file|id>`, mirroring the new status into the
/// file's frontmatter when a file is given (the file is the control surface).
async fn transition(
    client: &BroomvaClient,
    target: &str,
    action: &str,
    status: &str,
    verb: &str,
) -> BroomvaResult<()> {
    let (id, file) = resolve_target(target)?;
    client.set_handoff_status(&id, action).await?;
    if let Some(p) = file {
        write_back_status(&p, status)?;
    }
    println!("{verb} {id}");
    Ok(())
}

/// Mark a handoff in-progress (a fresh session picked it up).
pub async fn handle_pickup(client: &BroomvaClient, target: &str) -> BroomvaResult<()> {
    transition(client, target, "pick_up", "in_progress", "Picked up").await
}

/// Mark a handoff done.
pub async fn handle_done(client: &BroomvaClient, target: &str) -> BroomvaResult<()> {
    transition(client, target, "complete", "done", "Completed").await
}

/// Archive a handoff (set aside, off the active queue).
pub async fn handle_archive(client: &BroomvaClient, target: &str) -> BroomvaResult<()> {
    transition(client, target, "archive", "archived", "Archived").await
}

/// Re-queue a handoff (back to the waiting queue).
pub async fn handle_requeue(client: &BroomvaClient, target: &str) -> BroomvaResult<()> {
    transition(client, target, "requeue", "queued", "Re-queued").await
}

/// Make a handoff's content public without exposing the queue.
pub async fn handle_share(client: &BroomvaClient, target: &str) -> BroomvaResult<()> {
    let (id, file) = resolve_target(target)?;
    let resp = client.set_handoff_visibility(&id, true).await?;
    if let Some(p) = file {
        write_back_visibility(&p, &resp.visibility, resp.public_url.as_deref())?;
    }
    print_kv("Visibility", &resp.visibility);
    if let Some(url) = resp.public_url {
        print_kv("Public URL", &url);
    }
    Ok(())
}

/// Revoke public access to a handoff's content without changing queue status.
pub async fn handle_unshare(client: &BroomvaClient, target: &str) -> BroomvaResult<()> {
    let (id, file) = resolve_target(target)?;
    let resp = client.set_handoff_visibility(&id, false).await?;
    if let Some(p) = file {
        write_back_visibility(&p, &resp.visibility, None)?;
    }
    print_kv("Visibility", &resp.visibility);
    println!("Unshared {id}");
    Ok(())
}

/// Delete a handoff by `<file|id>`. When a file, clears the queue reference
/// from its frontmatter (the row is gone; the local arc params stay).
pub async fn handle_rm(client: &BroomvaClient, target: &str) -> BroomvaResult<()> {
    let (id, file) = resolve_target(target)?;
    client.delete_handoff(&id).await?;
    if let Some(p) = file {
        let parsed = fm::parse(&fs::read_to_string(&p)?);
        let mut front = parsed.frontmatter;
        for k in [
            "queue_id",
            "queue_slug",
            "queue_version",
            "queue_status",
            "queue_url",
            "pushed_at",
        ] {
            fm::remove(&mut front, k);
        }
        fs::write(&p, fm::render(&front, &parsed.body))?;
    }
    println!("Deleted {id}");
    Ok(())
}

// ── Markdown extraction ──

/// First `# ` heading (single hash), trimmed. None when absent.
fn extract_h1_title(md: &str) -> Option<String> {
    md.lines().find_map(|line| {
        let t = line.trim_start();
        if let Some(rest) = t.strip_prefix("# ") {
            let title = rest.trim();
            if title.is_empty() {
                None
            } else {
                Some(title.chars().take(300).collect())
            }
        } else {
            None
        }
    })
}

/// The `**TL;DR.**` lead-line content (markers + label stripped). None if absent.
fn extract_tldr(md: &str) -> Option<String> {
    for line in md.lines() {
        let Some(idx) = line.find("TL;DR") else {
            continue;
        };
        // Require the bold lead marker (`**TL;DR`) so a prose mention of "TL;DR"
        // mid-narrative isn't mistaken for the lead line (matches the server's
        // `**TL;DR**` matcher).
        if !line[..idx].trim_end().ends_with("**") {
            continue;
        }
        // Everything after the TL;DR label; drop closing `**` and punctuation.
        let after = &line[idx + "TL;DR".len()..];
        let after = after.trim_start_matches(['*', '.', ':', ' ']);
        let cleaned = after.trim().trim_end_matches('*').trim();
        if !cleaned.is_empty() {
            return Some(cleaned.chars().take(600).collect());
        }
    }
    None
}

/// The body of a `## <heading>` section (until the next `#`/`##` heading).
/// Case-insensitive on the heading text. None when missing or empty.
fn extract_section(md: &str, heading: &str) -> Option<String> {
    let target = heading.to_ascii_lowercase();
    let mut collecting = false;
    let mut out: Vec<&str> = Vec::new();
    for line in md.lines() {
        let trimmed = line.trim_start();
        if let Some(rest) = trimmed.strip_prefix("## ") {
            if collecting {
                break; // next section starts
            }
            if rest.trim().to_ascii_lowercase() == target {
                collecting = true;
            }
            continue;
        }
        // A top-level `# ` heading also ends a `## ` section.
        if collecting && trimmed.starts_with("# ") {
            break;
        }
        if collecting {
            out.push(line);
        }
    }
    if !collecting {
        return None;
    }
    let text = out.join("\n").trim().to_string();
    if text.is_empty() {
        None
    } else {
        Some(text.chars().take(4000).collect())
    }
}

// ── git provenance ──

fn parent_dir(path: &Path) -> PathBuf {
    path.parent()
        .filter(|p| !p.as_os_str().is_empty())
        .map(Path::to_path_buf)
        .unwrap_or_else(|| PathBuf::from("."))
}

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

/// Best-effort git provenance: origin remote, branch, repo-relative path, HEAD.
fn detect_git_source(path: &Path) -> Option<HandoffSource> {
    let dir = parent_dir(path);
    let repo = git_capture(&dir, &["remote", "get-url", "origin"]);
    let commit = git_capture(&dir, &["rev-parse", "HEAD"]);
    let branch = git_capture(&dir, &["rev-parse", "--abbrev-ref", "HEAD"]);
    let toplevel = git_capture(&dir, &["rev-parse", "--show-toplevel"]);

    let rel_path = match (toplevel, path.canonicalize().ok()) {
        (Some(top), Some(abs)) => Path::new(&top).canonicalize().ok().and_then(|top_abs| {
            abs.strip_prefix(&top_abs)
                .ok()
                .map(|p| p.to_string_lossy().into_owned())
        }),
        _ => None,
    };

    let source = HandoffSource {
        repo,
        path: rel_path,
        commit,
        branch,
        ..Default::default()
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

    let message = format!("handoff: push {file_name}");
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_h1_title() {
        let md = "# Handoff Queue — Phase 1\n\nbody";
        assert_eq!(
            extract_h1_title(md).as_deref(),
            Some("Handoff Queue — Phase 1")
        );
    }

    #[test]
    fn ignores_h2_for_title() {
        assert_eq!(extract_h1_title("## Not a title\ntext"), None);
    }

    #[test]
    fn extracts_tldr_line() {
        let md = "# T\n\n**TL;DR.** Ship the queue today.\n\nmore";
        assert_eq!(extract_tldr(md).as_deref(), Some("Ship the queue today."),);
    }

    #[test]
    fn extracts_tldr_with_colon() {
        let md = "**TL;DR:** Do the thing.";
        assert_eq!(extract_tldr(md).as_deref(), Some("Do the thing."));
    }

    #[test]
    fn ignores_prose_tldr_without_bold_marker() {
        // A narrative mention of TL;DR is not the lead line.
        let md = "I'll write the TL;DR after the snapshot.\n\n**TL;DR.** Real one.";
        assert_eq!(extract_tldr(md).as_deref(), Some("Real one."));
    }

    #[test]
    fn extracts_first_action_section() {
        let md = "# T\n\n## State\n\nstuff\n\n## First action\n\nRun `make deploy`.\nThen verify.\n\n## Pickup\n\n- x";
        assert_eq!(
            extract_section(md, "First action").as_deref(),
            Some("Run `make deploy`.\nThen verify."),
        );
    }

    #[test]
    fn missing_section_is_none() {
        assert_eq!(extract_section("# T\n\ntext", "First action"), None);
    }

    #[test]
    fn empty_handoff_source_detected() {
        let src = HandoffSource::default();
        assert!(src.is_empty());
        let src = HandoffSource {
            branch: Some("main".into()),
            ..Default::default()
        };
        assert!(!src.is_empty());
    }
}
