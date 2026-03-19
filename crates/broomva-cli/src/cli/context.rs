use crate::api::BroomvaClient;
use crate::cli::output::{OutputFormat, print_json_value, print_kv};
use crate::error::BroomvaResult;

pub async fn handle_show(client: &BroomvaClient, format: OutputFormat) -> BroomvaResult<()> {
    let ctx = client.get_context().await?;

    if format == OutputFormat::Json {
        let value = serde_json::to_value(&ctx)?;
        print_json_value(&value);
        return Ok(());
    }

    if let Some(ref conventions) = ctx.conventions {
        println!("Conventions:");
        print_json_value(conventions);
    }
    if let Some(ref stack) = ctx.stack {
        println!("Stack:");
        print_json_value(stack);
    }
    for (key, value) in &ctx.extra {
        println!("{key}:");
        print_json_value(value);
    }
    Ok(())
}

pub async fn handle_conventions(client: &BroomvaClient, format: OutputFormat) -> BroomvaResult<()> {
    let ctx = client.get_context().await?;

    if format == OutputFormat::Json {
        if let Some(ref conventions) = ctx.conventions {
            print_json_value(conventions);
        } else {
            println!("null");
        }
        return Ok(());
    }

    if let Some(conventions) = ctx.conventions {
        if let Some(obj) = conventions.as_object() {
            for (key, value) in obj {
                let val_str = match value {
                    serde_json::Value::String(s) => s.clone(),
                    other => other.to_string(),
                };
                print_kv(key, &val_str);
            }
        } else {
            print_json_value(&conventions);
        }
    } else {
        println!("  No conventions configured.");
    }
    Ok(())
}

pub async fn handle_stack(client: &BroomvaClient, format: OutputFormat) -> BroomvaResult<()> {
    let ctx = client.get_context().await?;

    if format == OutputFormat::Json {
        if let Some(ref stack) = ctx.stack {
            print_json_value(stack);
        } else {
            println!("null");
        }
        return Ok(());
    }

    if let Some(stack) = ctx.stack {
        if let Some(obj) = stack.as_object() {
            for (key, value) in obj {
                let val_str = match value {
                    serde_json::Value::String(s) => s.clone(),
                    other => other.to_string(),
                };
                print_kv(key, &val_str);
            }
        } else {
            print_json_value(&stack);
        }
    } else {
        println!("  No stack info available.");
    }
    Ok(())
}
