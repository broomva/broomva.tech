//! YAML frontmatter handling for handoff files (BRO-1418).
//!
//! A handoff `.md` carries a `---` frontmatter block that is BOTH the publish
//! input (`arc` / `specs` / `ticket` / `priority`) and the queue reference
//! written back on push (`queue_id` / `queue_slug` / `queue_version` /
//! `queue_status` / `queue_url` / `pushed_at`). serde_yaml round-trips it,
//! preserving any extra user keys and their order (Mapping is IndexMap-backed).

use serde_yaml::{Mapping, Value};

/// A handoff split into its frontmatter mapping + narrative body. `frontmatter`
/// is an empty Mapping when the file has no `---` block (legacy handoffs); the
/// `body` is always the narrative with any frontmatter stripped.
pub struct Parsed {
    pub frontmatter: Mapping,
    pub had_frontmatter: bool,
    pub body: String,
}

/// Split a raw file into (frontmatter, body). A leading `---\n … \n---\n` block
/// is parsed as YAML; everything after is the body. A malformed or non-mapping
/// block is treated as "no frontmatter" (the whole file is the body) — never an
/// error, so a stray `---` in prose can't break a push.
pub fn parse(raw: &str) -> Parsed {
    if let Some(after_open) = raw.strip_prefix("---\n") {
        if let Some(close) = after_open.find("\n---\n") {
            let yaml = &after_open[..close];
            // Body starts after the closing delimiter; drop the conventional
            // blank line(s) so the narrative begins at its first content line.
            let body = after_open[close + 5..].trim_start_matches(['\n', '\r']);
            if let Ok(Value::Mapping(m)) = serde_yaml::from_str::<Value>(yaml) {
                return Parsed {
                    frontmatter: m,
                    had_frontmatter: true,
                    body: body.to_string(),
                };
            }
        } else if let Some(yaml) = after_open
            .strip_suffix("\n---\n")
            .or_else(|| after_open.strip_suffix("\n---"))
        {
            // Frontmatter block with no body after it.
            if let Ok(Value::Mapping(m)) = serde_yaml::from_str::<Value>(yaml) {
                return Parsed {
                    frontmatter: m,
                    had_frontmatter: true,
                    body: String::new(),
                };
            }
        }
    }
    Parsed {
        frontmatter: Mapping::new(),
        had_frontmatter: false,
        body: raw.to_string(),
    }
}

/// Read a string-ish scalar (string or number coerced to string).
pub fn get_str(m: &Mapping, key: &str) -> Option<String> {
    match m.get(key)? {
        Value::String(s) if !s.trim().is_empty() => Some(s.clone()),
        Value::Number(n) => Some(n.to_string()),
        Value::Bool(b) => Some(b.to_string()),
        _ => None,
    }
}

/// Read an integer scalar.
pub fn get_i64(m: &Mapping, key: &str) -> Option<i64> {
    match m.get(key)? {
        Value::Number(n) => n.as_i64(),
        Value::String(s) => s.trim().parse().ok(),
        _ => None,
    }
}

/// Read a sequence of strings (also accepts a single bare string).
pub fn get_seq_str(m: &Mapping, key: &str) -> Vec<String> {
    match m.get(key) {
        Some(Value::Sequence(seq)) => seq
            .iter()
            .filter_map(|v| match v {
                Value::String(s) if !s.trim().is_empty() => Some(s.trim().to_string()),
                Value::Number(n) => Some(n.to_string()),
                _ => None,
            })
            .collect(),
        Some(Value::String(s)) if !s.trim().is_empty() => vec![s.trim().to_string()],
        _ => Vec::new(),
    }
}

/// Insert/update a string key, preserving its position when it already exists.
pub fn set_str(m: &mut Mapping, key: &str, val: &str) {
    m.insert(
        Value::String(key.to_string()),
        Value::String(val.to_string()),
    );
}

/// Insert/update an integer key.
pub fn set_i64(m: &mut Mapping, key: &str, val: i64) {
    m.insert(Value::String(key.to_string()), Value::Number(val.into()));
}

/// Insert/update a string-sequence key.
pub fn set_seq_str(m: &mut Mapping, key: &str, vals: &[String]) {
    let seq = vals
        .iter()
        .map(|s| Value::String(s.clone()))
        .collect::<Vec<_>>();
    m.insert(Value::String(key.to_string()), Value::Sequence(seq));
}

/// Remove a key if present.
pub fn remove(m: &mut Mapping, key: &str) {
    m.remove(key);
}

/// Re-render a file from frontmatter + body: `---\n{yaml}---\n\n{body}\n`. An
/// empty mapping yields the bare body (no `---` block). Leading newlines on the
/// body are normalized to a single blank line after the frontmatter.
pub fn render(m: &Mapping, body: &str) -> String {
    if m.is_empty() {
        return body.to_string();
    }
    let yaml = serde_yaml::to_string(m).unwrap_or_default();
    let trimmed_body = body.trim_start_matches(['\n', '\r']);
    let mut out = format!("---\n{yaml}---\n\n{trimmed_body}");
    if !out.ends_with('\n') {
        out.push('\n');
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_no_frontmatter() {
        let p = parse("# Title\n\nbody");
        assert!(!p.had_frontmatter);
        assert!(p.frontmatter.is_empty());
        assert_eq!(p.body, "# Title\n\nbody");
    }

    #[test]
    fn parses_frontmatter_and_body() {
        let raw = "---\narc: my-arc\nticket: BRO-1\nspecs:\n  - a\n  - b\n---\n\n# Title\n\nbody";
        let p = parse(raw);
        assert!(p.had_frontmatter);
        assert_eq!(get_str(&p.frontmatter, "arc").as_deref(), Some("my-arc"));
        assert_eq!(get_str(&p.frontmatter, "ticket").as_deref(), Some("BRO-1"));
        assert_eq!(get_seq_str(&p.frontmatter, "specs"), vec!["a", "b"]);
        assert_eq!(p.body, "# Title\n\nbody");
    }

    #[test]
    fn malformed_block_is_treated_as_body() {
        // A stray `---` rule in prose must not be mistaken for frontmatter.
        let raw = "# Title\n\n---\n\nmore";
        let p = parse(raw);
        assert!(!p.had_frontmatter);
        assert_eq!(p.body, raw);
    }

    #[test]
    fn round_trips_with_added_queue_keys() {
        let raw = "# Title\n\nbody text";
        let mut p = parse(raw);
        set_str(&mut p.frontmatter, "arc", "my-arc");
        set_seq_str(&mut p.frontmatter, "specs", &["spec-a".to_string()]);
        set_str(&mut p.frontmatter, "queue_id", "abc123");
        set_i64(&mut p.frontmatter, "queue_version", 1);
        let out = render(&p.frontmatter, &p.body);
        // Re-parse the rendered output: frontmatter + identical body.
        let re = parse(&out);
        assert!(re.had_frontmatter);
        assert_eq!(get_str(&re.frontmatter, "arc").as_deref(), Some("my-arc"));
        assert_eq!(
            get_str(&re.frontmatter, "queue_id").as_deref(),
            Some("abc123")
        );
        assert_eq!(get_i64(&re.frontmatter, "queue_version"), Some(1));
        assert_eq!(get_seq_str(&re.frontmatter, "specs"), vec!["spec-a"]);
        // render() guarantees a trailing newline on the file; body content is
        // otherwise preserved exactly.
        assert_eq!(re.body.trim_end(), "# Title\n\nbody text");
    }

    #[test]
    fn updates_preserve_position_and_other_keys() {
        let raw = "---\narc: a\nqueue_status: queued\ncustom: keep-me\n---\n\nbody";
        let mut p = parse(raw);
        set_str(&mut p.frontmatter, "queue_status", "done");
        let out = render(&p.frontmatter, &p.body);
        let re = parse(&out);
        assert_eq!(
            get_str(&re.frontmatter, "queue_status").as_deref(),
            Some("done")
        );
        assert_eq!(
            get_str(&re.frontmatter, "custom").as_deref(),
            Some("keep-me")
        );
        assert_eq!(get_str(&re.frontmatter, "arc").as_deref(), Some("a"));
    }
}
