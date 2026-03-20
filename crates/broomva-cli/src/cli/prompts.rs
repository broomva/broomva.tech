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
) -> BroomvaResult<()> {
    let prompt = client.get_prompt(slug).await?;

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
