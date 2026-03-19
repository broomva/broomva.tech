mod api;
mod cli;
mod config;
mod daemon;
mod error;
mod frontmatter;

use clap::Parser;

fn main() -> anyhow::Result<()> {
    let _ = dotenvy::dotenv();

    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "broomva=info".into()),
        )
        .with_target(false)
        .init();

    let parsed = cli::Cli::parse();

    let rt = tokio::runtime::Runtime::new()?;
    let result = rt.block_on(cli::run_command(parsed));

    match result {
        Ok(()) => std::process::exit(0),
        Err(e) => {
            eprintln!("error: {e}");
            std::process::exit(1);
        }
    }
}
