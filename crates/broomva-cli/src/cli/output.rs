use clap::ValueEnum;
use serde::Serialize;

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, ValueEnum)]
pub enum OutputFormat {
    #[default]
    Table,
    Json,
}

/// Print a table with headers and rows. Falls back to JSON if format is Json.
pub fn print_table(headers: &[&str], rows: &[Vec<String>], format: OutputFormat) {
    if format == OutputFormat::Json {
        let json_rows: Vec<serde_json::Value> = rows
            .iter()
            .map(|row| {
                let mut obj = serde_json::Map::new();
                for (i, header) in headers.iter().enumerate() {
                    let val = row.get(i).cloned().unwrap_or_default();
                    obj.insert(header.to_string(), serde_json::Value::String(val));
                }
                serde_json::Value::Object(obj)
            })
            .collect();
        println!(
            "{}",
            serde_json::to_string_pretty(&json_rows).unwrap_or_default()
        );
        return;
    }

    if rows.is_empty() {
        println!("  (no results)");
        return;
    }

    // Compute column widths.
    let mut widths: Vec<usize> = headers.iter().map(|h| h.len()).collect();
    for row in rows {
        for (i, cell) in row.iter().enumerate() {
            if i < widths.len() {
                widths[i] = widths[i].max(cell.len());
            }
        }
    }

    // Header.
    let header_line: Vec<String> = headers
        .iter()
        .enumerate()
        .map(|(i, h)| format!("{:<width$}", h.to_uppercase(), width = widths[i]))
        .collect();
    println!("{}", header_line.join("  "));

    // Separator.
    let separator: Vec<String> = widths.iter().map(|w| "-".repeat(*w)).collect();
    println!("{}", separator.join("  "));

    // Rows.
    for row in rows {
        let cells: Vec<String> = row
            .iter()
            .enumerate()
            .map(|(i, cell)| {
                let width = widths.get(i).copied().unwrap_or(0);
                format!("{cell:<width$}")
            })
            .collect();
        println!("{}", cells.join("  "));
    }
}

/// Print a key-value pair.
pub fn print_kv(label: &str, value: &str) {
    println!("  {label:<20} {value}");
}

/// Print a serializable value as pretty JSON.
pub fn print_json<T: Serialize>(value: &T) {
    if let Ok(json) = serde_json::to_string_pretty(value) {
        println!("{json}");
    }
}

/// Print a raw JSON value.
pub fn print_json_value(value: &serde_json::Value) {
    println!(
        "{}",
        serde_json::to_string_pretty(value).unwrap_or_default()
    );
}
