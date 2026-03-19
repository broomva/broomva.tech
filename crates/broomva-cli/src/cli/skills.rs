use crate::api::BroomvaClient;
use crate::cli::output::{OutputFormat, print_json, print_kv, print_table};
use crate::error::BroomvaResult;

pub async fn handle_list(
    client: &BroomvaClient,
    layer: Option<&str>,
    format: OutputFormat,
) -> BroomvaResult<()> {
    let skills = client.list_skills(layer).await?;

    if format == OutputFormat::Json {
        print_json(&skills);
        return Ok(());
    }

    let rows: Vec<Vec<String>> = skills
        .iter()
        .map(|s| {
            vec![
                s.slug.clone(),
                s.name.clone(),
                s.layer.clone().unwrap_or_default(),
                s.description.clone().unwrap_or_default(),
            ]
        })
        .collect();

    print_table(&["slug", "name", "layer", "description"], &rows, format);
    Ok(())
}

pub async fn handle_get(
    client: &BroomvaClient,
    slug: &str,
    format: OutputFormat,
) -> BroomvaResult<()> {
    let skill = client.get_skill(slug).await?;

    if format == OutputFormat::Json {
        print_json(&skill);
        return Ok(());
    }

    print_kv("Name", &skill.name);
    print_kv("Slug", &skill.slug);
    if let Some(ref l) = skill.layer {
        print_kv("Layer", l);
    }
    if let Some(ref d) = skill.description {
        print_kv("Description", d);
    }
    if let Some(ref c) = skill.content {
        println!();
        println!("{c}");
    }
    Ok(())
}

pub async fn handle_install(client: &BroomvaClient, slug: &str) -> BroomvaResult<()> {
    let skill = client.get_skill(slug).await?;

    if let Some(ref cmd) = skill.install_command {
        println!("  Installing {slug}...");
        let status = tokio::process::Command::new("sh")
            .arg("-c")
            .arg(cmd)
            .status()
            .await?;
        if status.success() {
            println!("  Installed {slug} successfully.");
        } else {
            eprintln!("  Install command exited with status: {status}");
        }
    } else {
        println!("  No install command defined for {slug}.");
        if let Some(ref content) = skill.content {
            println!("  Skill content:");
            println!("{content}");
        }
    }
    Ok(())
}
