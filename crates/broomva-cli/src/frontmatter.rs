use std::collections::BTreeMap;

/// Parsed frontmatter + body from a prompt file.
#[derive(Debug, Clone)]
pub struct PromptFile {
    pub frontmatter: BTreeMap<String, String>,
    pub body: String,
}

/// Parse a file with optional YAML frontmatter delimited by `---`.
pub fn parse(input: &str) -> PromptFile {
    let trimmed = input.trim_start();
    if !trimmed.starts_with("---") {
        return PromptFile {
            frontmatter: BTreeMap::new(),
            body: input.to_string(),
        };
    }

    // Find the closing `---`.
    let after_first = &trimmed[3..];
    let rest = after_first.trim_start_matches(['\r', '\n']);

    if let Some(end) = rest.find("\n---") {
        let yaml_block = &rest[..end];
        let body = rest[end + 4..].trim_start_matches(['\r', '\n']);

        let mut fm = BTreeMap::new();
        for line in yaml_block.lines() {
            if let Some((key, value)) = line.split_once(':') {
                let key = key.trim().to_string();
                let value = value.trim().trim_matches('"').to_string();
                if !key.is_empty() {
                    fm.insert(key, value);
                }
            }
        }

        PromptFile {
            frontmatter: fm,
            body: body.to_string(),
        }
    } else {
        PromptFile {
            frontmatter: BTreeMap::new(),
            body: input.to_string(),
        }
    }
}

/// Render a prompt file with frontmatter.
pub fn render(pf: &PromptFile) -> String {
    if pf.frontmatter.is_empty() {
        return pf.body.clone();
    }

    let mut out = String::from("---\n");
    for (key, value) in &pf.frontmatter {
        out.push_str(&format!("{key}: \"{value}\"\n"));
    }
    out.push_str("---\n\n");
    out.push_str(&pf.body);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_with_frontmatter() {
        let input = r#"---
title: "My Prompt"
category: "dev"
---

This is the body."#;

        let pf = parse(input);
        assert_eq!(pf.frontmatter.get("title").unwrap(), "My Prompt");
        assert_eq!(pf.frontmatter.get("category").unwrap(), "dev");
        assert_eq!(pf.body, "This is the body.");
    }

    #[test]
    fn parse_without_frontmatter() {
        let input = "Just a body with no frontmatter.";
        let pf = parse(input);
        assert!(pf.frontmatter.is_empty());
        assert_eq!(pf.body, input);
    }

    #[test]
    fn roundtrip() {
        let pf = PromptFile {
            frontmatter: BTreeMap::from([
                ("category".into(), "dev".into()),
                ("title".into(), "Test".into()),
            ]),
            body: "Hello world".into(),
        };

        let rendered = render(&pf);
        let parsed = parse(&rendered);
        assert_eq!(parsed.frontmatter.get("title").unwrap(), "Test");
        assert_eq!(parsed.frontmatter.get("category").unwrap(), "dev");
        assert_eq!(parsed.body, "Hello world");
    }
}
