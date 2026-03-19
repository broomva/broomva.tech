pub mod auth;
pub mod config_cmd;
pub mod context;
pub mod daemon_cmd;
pub mod output;
pub mod prompts;
pub mod skills;

use clap::{Parser, Subcommand};
use output::OutputFormat;

use crate::api::BroomvaClient;
use crate::config;
use crate::error::BroomvaResult;

#[derive(Parser, Debug)]
#[command(
    name = "broomva",
    version,
    about = "CLI and daemon for broomva.tech — prompts, skills, context, and infrastructure monitoring"
)]
pub struct Cli {
    /// API base URL (overrides config and env).
    #[arg(long, global = true, env = "BROOMVA_API_BASE")]
    pub api_base: Option<String>,

    /// Auth token (overrides config and env).
    #[arg(long, global = true, env = "BROOMVA_TOKEN")]
    pub token: Option<String>,

    /// Disable color output.
    #[arg(long, global = true)]
    pub no_color: bool,

    /// Output format.
    #[arg(long, global = true, default_value = "table", value_enum)]
    pub format: OutputFormat,

    #[command(subcommand)]
    pub command: Command,
}

#[derive(Subcommand, Debug)]
pub enum Command {
    /// Authentication commands.
    Auth {
        #[command(subcommand)]
        action: AuthCommand,
    },
    /// Manage prompts.
    Prompts {
        #[command(subcommand)]
        action: PromptsCommand,
    },
    /// Manage skills.
    Skills {
        #[command(subcommand)]
        action: SkillsCommand,
    },
    /// Project context information.
    Context {
        #[command(subcommand)]
        action: ContextCommand,
    },
    /// Configuration management.
    Config {
        #[command(subcommand)]
        action: ConfigCommand,
    },
    /// Daemon management.
    Daemon {
        #[command(subcommand)]
        action: DaemonCommand,
    },
}

// ── Auth ──

#[derive(Subcommand, Debug)]
pub enum AuthCommand {
    /// Log in via device code flow or manual token.
    Login {
        /// Paste token manually instead of browser flow.
        #[arg(long)]
        manual: bool,
    },
    /// Log out and clear stored token.
    Logout,
    /// Show auth status.
    Status,
    /// Print the stored token.
    Token,
}

// ── Prompts ──

#[derive(Subcommand, Debug)]
pub enum PromptsCommand {
    /// List prompts.
    List {
        #[arg(long)]
        category: Option<String>,
        #[arg(long)]
        tag: Option<String>,
        #[arg(long)]
        model: Option<String>,
        #[arg(long)]
        mine: bool,
    },
    /// Get a prompt by slug.
    Get {
        slug: String,
        /// Print raw content only.
        #[arg(long)]
        raw: bool,
    },
    /// Create a new prompt.
    Create {
        #[arg(long)]
        title: String,
        #[arg(long)]
        content: String,
        #[arg(long)]
        summary: Option<String>,
        #[arg(long)]
        category: Option<String>,
        #[arg(long)]
        model: Option<String>,
        #[arg(long, value_delimiter = ',')]
        tags: Option<Vec<String>>,
        #[arg(long)]
        visibility: Option<String>,
    },
    /// Update an existing prompt.
    Update {
        slug: String,
        #[arg(long)]
        title: Option<String>,
        #[arg(long)]
        content: Option<String>,
        #[arg(long)]
        summary: Option<String>,
        #[arg(long)]
        category: Option<String>,
        #[arg(long)]
        model: Option<String>,
        #[arg(long, value_delimiter = ',')]
        tags: Option<Vec<String>>,
        #[arg(long)]
        visibility: Option<String>,
    },
    /// Delete a prompt.
    Delete { slug: String },
    /// Pull a prompt to a local file.
    Pull {
        slug: String,
        /// Output file path.
        #[arg(short, long)]
        output: Option<String>,
    },
    /// Push a local file as a prompt.
    Push {
        /// Path to the prompt file.
        file: String,
        /// Create instead of update.
        #[arg(long)]
        create: bool,
    },
}

// ── Skills ──

#[derive(Subcommand, Debug)]
pub enum SkillsCommand {
    /// List available skills.
    List {
        #[arg(long)]
        layer: Option<String>,
    },
    /// Get skill details.
    Get { slug: String },
    /// Install a skill.
    Install { slug: String },
}

// ── Context ──

#[derive(Subcommand, Debug)]
pub enum ContextCommand {
    /// Show full context.
    Show,
    /// Show conventions.
    Conventions,
    /// Show stack info.
    Stack,
}

// ── Config ──

#[derive(Subcommand, Debug)]
pub enum ConfigCommand {
    /// Set a config value.
    Set { key: String, value: String },
    /// Get a config value (or all).
    Get {
        /// Config key (omit for all).
        key: Option<String>,
    },
    /// Reset config to defaults.
    Reset,
}

// ── Daemon ──

#[derive(Subcommand, Debug)]
pub enum DaemonCommand {
    /// Start the daemon.
    Start {
        /// Environment target.
        #[arg(long, default_value = "railway", value_enum)]
        env: daemon_cmd::EnvTarget,
        /// Dashboard port.
        #[arg(long)]
        port: Option<u16>,
        /// Heartbeat interval in ms.
        #[arg(long)]
        interval: Option<u64>,
        /// Run in background.
        #[arg(long)]
        detach: bool,
        /// Symphony URL override.
        #[arg(long)]
        symphony_url: Option<String>,
        /// Arcan URL override.
        #[arg(long)]
        arcan_url: Option<String>,
        /// Lago URL override.
        #[arg(long)]
        lago_url: Option<String>,
        /// Autonomic URL override.
        #[arg(long)]
        autonomic_url: Option<String>,
    },
    /// Stop the daemon.
    Stop,
    /// Show daemon status.
    Status,
    /// Show daemon logs.
    Logs {
        /// Number of lines to show.
        #[arg(long, default_value = "50")]
        lines: usize,
        /// Filter by log level.
        #[arg(long)]
        level: Option<String>,
    },
    /// Show daemon tasks/sensors.
    Tasks {
        /// Show all tasks including inactive.
        #[arg(long)]
        all: bool,
    },
}

// ── Dispatch ──

pub async fn run_command(cli: Cli) -> BroomvaResult<()> {
    let format = resolve_format(&cli);
    let api_base = config::resolve_api_base(cli.api_base.as_deref())?;
    let token = config::resolve_token(cli.token.as_deref())?;

    let client = BroomvaClient::new(api_base, token);

    match cli.command {
        Command::Auth { action } => match action {
            AuthCommand::Login { manual } => auth::handle_login(&client, manual).await,
            AuthCommand::Logout => auth::handle_logout().await,
            AuthCommand::Status => auth::handle_status(&client, format).await,
            AuthCommand::Token => auth::handle_token().await,
        },
        Command::Prompts { action } => match action {
            PromptsCommand::List {
                category,
                tag,
                model,
                mine,
            } => {
                prompts::handle_list(
                    &client,
                    category.as_deref(),
                    tag.as_deref(),
                    model.as_deref(),
                    mine,
                    format,
                )
                .await
            }
            PromptsCommand::Get { slug, raw } => {
                prompts::handle_get(&client, &slug, raw, format).await
            }
            PromptsCommand::Create {
                title,
                content,
                summary,
                category,
                model,
                tags,
                visibility,
            } => {
                let req = crate::api::types::CreatePromptRequest {
                    title,
                    content,
                    summary,
                    category,
                    model,
                    tags,
                    visibility,
                };
                prompts::handle_create(&client, req, format).await
            }
            PromptsCommand::Update {
                slug,
                title,
                content,
                summary,
                category,
                model,
                tags,
                visibility,
            } => {
                let req = crate::api::types::UpdatePromptRequest {
                    title,
                    content,
                    summary,
                    category,
                    model,
                    tags,
                    visibility,
                };
                prompts::handle_update(&client, &slug, req, format).await
            }
            PromptsCommand::Delete { slug } => prompts::handle_delete(&client, &slug).await,
            PromptsCommand::Pull { slug, output } => {
                prompts::handle_pull(&client, &slug, output.as_deref()).await
            }
            PromptsCommand::Push { file, create } => {
                prompts::handle_push(&client, &file, create, format).await
            }
        },
        Command::Skills { action } => match action {
            SkillsCommand::List { layer } => {
                skills::handle_list(&client, layer.as_deref(), format).await
            }
            SkillsCommand::Get { slug } => skills::handle_get(&client, &slug, format).await,
            SkillsCommand::Install { slug } => skills::handle_install(&client, &slug).await,
        },
        Command::Context { action } => match action {
            ContextCommand::Show => context::handle_show(&client, format).await,
            ContextCommand::Conventions => context::handle_conventions(&client, format).await,
            ContextCommand::Stack => context::handle_stack(&client, format).await,
        },
        Command::Config { action } => match action {
            ConfigCommand::Set { key, value } => config_cmd::handle_set(&key, &value).await,
            ConfigCommand::Get { key } => config_cmd::handle_get(key.as_deref(), format).await,
            ConfigCommand::Reset => config_cmd::handle_reset().await,
        },
        Command::Daemon { action } => match action {
            DaemonCommand::Start {
                env,
                port,
                interval,
                detach,
                symphony_url,
                arcan_url,
                lago_url,
                autonomic_url,
            } => {
                daemon_cmd::handle_start(daemon_cmd::StartOpts {
                    env,
                    port,
                    interval,
                    detach,
                    symphony_url,
                    arcan_url,
                    lago_url,
                    autonomic_url,
                })
                .await
            }
            DaemonCommand::Stop => daemon_cmd::handle_stop().await,
            DaemonCommand::Status => daemon_cmd::handle_status(format).await,
            DaemonCommand::Logs { lines, level } => {
                daemon_cmd::handle_logs(lines, level.as_deref(), format).await
            }
            DaemonCommand::Tasks { all } => daemon_cmd::handle_tasks(all, format).await,
        },
    }
}

fn resolve_format(cli: &Cli) -> OutputFormat {
    // CLI flag takes precedence.
    if cli.format != OutputFormat::Table {
        return cli.format;
    }
    // Check config default.
    if let Ok(cfg) = config::read_config()
        && let Some(fmt) = cfg.default_format.as_deref()
        && fmt.eq_ignore_ascii_case("json")
    {
        return OutputFormat::Json;
    }
    OutputFormat::Table
}
