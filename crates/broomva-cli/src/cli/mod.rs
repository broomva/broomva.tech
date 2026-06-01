pub mod agent;
pub mod auth;
pub mod chat;
pub mod config_cmd;
pub mod console;
pub mod context;
pub mod daemon_cmd;
pub mod docs;
pub mod output;
pub mod prompts;
pub mod relay;
pub mod setup;
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

    /// Extra root CA certificate (PEM) to trust on top of webpki
    /// defaults. Use this when targeting a self-signed dev gateway
    /// (e.g. local lumen-smoke at `wss://127.0.0.1:8443`). Falls back
    /// to the `BROOMVA_CA_CERT` env var. Production roots remain
    /// trusted in all cases. BRO-1186.
    #[arg(long, global = true, value_name = "PATH", env = "BROOMVA_CA_CERT")]
    pub cacert: Option<String>,

    #[command(subcommand)]
    pub command: Option<Command>,
}

#[derive(Subcommand, Debug)]
pub enum Command {
    /// Interactive onboarding setup wizard.
    Setup,
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
    /// Publish + manage HTML documents (specs, PRDs, reports) at a gated URL.
    ///
    /// `broomva docs publish spec.html` uploads the file and prints a stable
    /// `https://broomva.tech/d/<id>` link, viewable only by you. Ideal for
    /// handing a finished HTML spec back from a remote/headless session.
    Docs {
        #[command(subcommand)]
        action: DocsCommand,
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
    /// Console — open dashboard, check service health, view sessions.
    Console {
        #[command(subcommand)]
        command: Option<ConsoleCommand>,
    },
    /// Relay — remote agent session management.
    Relay {
        #[command(subcommand)]
        action: RelayCommand,
    },
    /// Chat — interactive agent REPL backed by lifegw streaming.
    ///
    /// One-shot: `broomva chat "<prompt>"` sends a single turn, streams
    /// the reply, and exits. Without a prompt, drops into the REPL.
    ///
    /// Subcommands:
    ///   * `broomva chat resume <session-id>` — resume an existing session.
    ///   * `broomva chat sessions [list|prune]` — manage local history.
    ///   * `broomva chat models` — list known models.
    ///
    /// REPL slash commands: `/save`, `/model <id>`, `/history`, `/clear`,
    /// `/exit`, `/help`. Press ESC to interrupt a streaming reply.
    Chat {
        /// One-shot prompt. Omit to enter the interactive REPL.
        prompt: Option<String>,

        /// Resume an existing session by ID (overridable per-flag).
        #[arg(long, value_name = "ID")]
        session: Option<String>,
        /// Model override (defaults to ~/.broomva/config.json
        /// `defaultModel` or `claude-sonnet-4-6`).
        #[arg(long, value_name = "ID")]
        model: Option<String>,
        /// Gateway WSS URL override (defaults to BROOMVA_GATEWAY_URL or
        /// the production gateway).
        #[arg(long, value_name = "WSS")]
        gateway_url: Option<String>,

        #[command(subcommand)]
        action: Option<ChatCommand>,
    },
    /// Agent — typed task invocation via lifed (Phase B).
    ///
    /// `broomva agent run <task.yaml>` validates the spec client-side,
    /// fires a telemetry beacon, submits to `lifed.Agent.CreateSession`,
    /// and watches the event stream until the saga terminates.
    ///
    /// Filesystem layout: each run produces
    /// `~/.broomva/runs/<run_id>/{transcript.jsonl, output.json, metadata.yaml}`.
    Agent {
        #[command(subcommand)]
        action: AgentCommand,
        /// lifed base URL override (e.g. `https://lifed.broomva.tech`).
        #[arg(long, value_name = "URL", global = true)]
        lifed_url: Option<String>,
        /// Per-step timeout (seconds) override. Applied to `agent.timeout_seconds`.
        #[arg(long, value_name = "SECS", global = true)]
        turn_timeout: Option<u64>,
    },
}

// ── Agent (Phase B) ──

#[derive(Subcommand, Debug)]
pub enum AgentCommand {
    /// Submit a typed task. `broomva agent run task.yaml` validates +
    /// submits + watches until terminal.
    Run {
        /// Path to a YAML task spec (omit when --inline is set).
        task: Option<std::path::PathBuf>,
        /// Inline JSON task spec (mutually exclusive with TASK).
        #[arg(long, value_name = "JSON")]
        inline: Option<String>,
        /// Watch the event stream until terminal (default = sync).
        #[arg(long, default_value_t = true)]
        watch: bool,
        /// Submit + return immediately (overrides --watch).
        #[arg(long)]
        detach: bool,
        /// Validate the task spec and print the cost estimate without submitting.
        #[arg(long)]
        dry_run: bool,
        /// Client-side cost cap (USD). Overrides `agent.max_cost_usd` in spec.
        #[arg(long, value_name = "USD")]
        max_cost: Option<f64>,
        /// Skip post-run output schema validation.
        #[arg(long)]
        skip_output_validation: bool,
    },
    /// List recent runs (newest first).
    List {
        /// Filter by status.
        #[arg(long, value_parser = ["queued", "running", "completed", "failed", "cancelled"])]
        status: Option<String>,
        /// Limit row count (server-side default ~50).
        #[arg(long)]
        limit: Option<u32>,
    },
    /// Show a single run.
    Get { run_id: String },
    /// Tail the event stream of an in-flight run.
    Tail {
        run_id: String,
        /// Resume from a specific event sequence (Phase B.1).
        #[arg(long, value_name = "SEQ")]
        from_sequence: Option<u64>,
    },
    /// Cancel a run.
    Cancel { run_id: String },
    /// Manage bundled + user task templates.
    Templates {
        #[command(subcommand)]
        action: AgentTemplatesCommand,
    },
}

#[derive(Subcommand, Debug)]
pub enum AgentTemplatesCommand {
    /// List bundled + user templates.
    List,
    /// Print one template to stdout.
    Show { name: String },
    /// Copy bundled templates into ~/.broomva/templates/.
    Init {
        /// Overwrite any existing user-template files.
        #[arg(long)]
        force: bool,
    },
}

// ── Chat ──

#[derive(Subcommand, Debug)]
pub enum ChatCommand {
    /// Resume an existing chat session by ID.
    Resume {
        /// Session ID returned by a previous `broomva chat`.
        session_id: String,
    },
    /// Manage local session history (under ~/.broomva/sessions/).
    Sessions {
        #[command(subcommand)]
        action: ChatSessionsCommand,
    },
    /// List known models.
    Models,
}

#[derive(Subcommand, Debug)]
pub enum ChatSessionsCommand {
    /// List sessions on disk.
    List,
    /// Remove sessions older than the threshold.
    Prune {
        /// Threshold in days (default: 30).
        #[arg(long, value_name = "DAYS", default_value_t = chat::DEFAULT_PRUNE_DAYS)]
        older_than: u64,
        /// Don't actually remove anything; just print what would go.
        #[arg(long)]
        dry_run: bool,
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

// ── Docs (BRO-1293) ──

#[derive(Subcommand, Debug)]
pub enum DocsCommand {
    /// Publish a local HTML file → prints a stable, owner-gated URL.
    Publish {
        /// Path to the .html file to publish.
        file: String,
        /// Title override (default: the file's <title> tag, else its name).
        #[arg(long)]
        title: Option<String>,
        /// Stage + commit the file before publishing (git archival).
        #[arg(long)]
        commit: bool,
        /// Open the published URL in the default browser.
        #[arg(long)]
        open: bool,
    },
    /// List your published documents.
    List,
    /// Open a published document in the browser by id.
    Open { id: String },
    /// Delete a published document by id.
    Rm { id: String },
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
        /// Include per-prompt metric counts (copies/cli/skill/runs_7d).
        #[arg(long)]
        metrics: bool,
        /// Sort by metric (requires --metrics).
        #[arg(long, value_parser = ["skill_invokes", "cli_pulls", "copies", "runs_7d"])]
        sort: Option<String>,
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
    /// Pull a prompt to a local file. Fires a telemetry invocation
    /// beacon by default; pass `--json` to emit a machine-readable line
    /// on stderr with the invocation id (used by the Claude Code skill).
    Pull {
        slug: String,
        /// Output file path. Omit to write to `<slug>.md` in cwd.
        #[arg(short, long)]
        output: Option<String>,
        /// Emit a machine-readable JSON line on stderr containing
        /// {invocation_id, prompt_slug, prompt_version, posted}.
        #[arg(long)]
        json: bool,
    },
    /// Push a local file as a prompt.
    Push {
        /// Path to the prompt file.
        file: String,
        /// Create instead of update.
        #[arg(long)]
        create: bool,
    },
    /// Mark a prior invocation as completed (or failed/abandoned). The
    /// invocation id is the one printed by `broomva prompts pull` (or
    /// emitted on stderr in `--json` mode).
    Complete {
        /// Invocation id (UUID v4) returned from `prompts pull`.
        invocation_id: String,
        /// Final status. Default: completed.
        #[arg(long, default_value = "completed", value_parser = ["completed", "failed", "abandoned"])]
        status: String,
        /// Model identifier (e.g. `claude-sonnet-4.5`). Required when
        /// status=completed for cost computation.
        #[arg(long)]
        model: Option<String>,
        /// Wall-clock latency in milliseconds.
        #[arg(long)]
        latency_ms: Option<i64>,
        /// Input token count.
        #[arg(long)]
        tokens_in: Option<i64>,
        /// Output token count.
        #[arg(long)]
        tokens_out: Option<i64>,
        /// Required when status=failed.
        #[arg(long)]
        error_message: Option<String>,
    },
    /// Leave thumbs-up/down feedback on a prompt invocation.
    Feedback {
        /// Invocation id. Omit to leave detached feedback (use --slug then).
        invocation_id: Option<String>,
        /// Explicitly target a slug. Required for detached feedback.
        #[arg(long)]
        slug: Option<String>,
        /// Prompt version (for detached feedback). Defaults to "unknown".
        #[arg(long, default_value = "unknown")]
        version: String,
        /// Thumbs direction.
        #[arg(long, value_parser = ["up", "down"])]
        signal: String,
        /// Optional freeform note (max 2000 chars).
        #[arg(long)]
        text: Option<String>,
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

// ── Relay ──

#[derive(Subcommand, Debug)]
pub enum RelayCommand {
    /// Register this machine as a relay node (device auth flow).
    Auth {
        /// Node display name (defaults to hostname).
        #[arg(long)]
        name: Option<String>,
    },
    /// Start the relay daemon.
    Start {
        /// Local API bind address.
        #[arg(long, default_value = "127.0.0.1:3004")]
        bind: String,
    },
    /// Stop the relay daemon.
    Stop,
    /// Show relay node and session status.
    Status,
    /// List active relay sessions.
    Sessions,
}

// ── Console ──

#[derive(Subcommand, Debug)]
pub enum ConsoleCommand {
    /// Show service health status.
    Status,
    /// List agent sessions.
    Sessions,
    /// Show service health (alias for status).
    Health,
}

// ── Dispatch ──

pub async fn run_command(cli: Cli) -> BroomvaResult<()> {
    // No subcommand → show banner + quick help.
    let command = match cli.command {
        Some(cmd) => cmd,
        None => {
            setup::print_no_args_banner();
            return Ok(());
        }
    };

    // Setup wizard runs without API client.
    if matches!(command, Command::Setup) {
        return setup::run().await;
    }

    let format = resolve_format_from_parts(cli.format, cli.no_color);
    let api_base = config::resolve_api_base(cli.api_base.as_deref())?;
    let token = config::resolve_token(cli.token.as_deref())?;

    let client = BroomvaClient::new(api_base, token.clone());

    match command {
        Command::Setup => unreachable!(),
        Command::Auth { action } => match action {
            AuthCommand::Login { manual } => auth::handle_login(&client, manual).await,
            AuthCommand::Logout => auth::handle_logout().await,
            AuthCommand::Status => auth::handle_status(&client, format).await,
            AuthCommand::Token => auth::handle_token().await,
        },
        Command::Docs { action } => match action {
            DocsCommand::Publish {
                file,
                title,
                commit,
                open,
            } => docs::handle_publish(&client, &file, title, commit, open, format).await,
            DocsCommand::List => docs::handle_list(&client, format).await,
            DocsCommand::Open { id } => docs::handle_open(&client, &id).await,
            DocsCommand::Rm { id } => docs::handle_rm(&client, &id).await,
        },
        Command::Prompts { action } => match action {
            PromptsCommand::List {
                category,
                tag,
                model,
                mine,
                metrics,
                sort,
            } => {
                prompts::handle_list(
                    &client,
                    category.as_deref(),
                    tag.as_deref(),
                    model.as_deref(),
                    mine,
                    metrics,
                    sort.as_deref(),
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
                    version: None,
                    tags,
                    variables: None,
                    links: None,
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
                    version: None,
                    tags,
                    variables: None,
                    links: None,
                    visibility,
                };
                prompts::handle_update(&client, &slug, req, format).await
            }
            PromptsCommand::Delete { slug } => prompts::handle_delete(&client, &slug).await,
            PromptsCommand::Pull { slug, output, json } => {
                prompts::handle_pull(&client, &slug, output.as_deref(), json).await
            }
            PromptsCommand::Push { file, create } => {
                prompts::handle_push(&client, &file, create, format).await
            }
            PromptsCommand::Complete {
                invocation_id,
                status,
                model,
                latency_ms,
                tokens_in,
                tokens_out,
                error_message,
            } => {
                prompts::handle_complete(
                    &client,
                    &invocation_id,
                    &status,
                    model.as_deref(),
                    latency_ms,
                    tokens_in,
                    tokens_out,
                    error_message.as_deref(),
                    format,
                )
                .await
            }
            PromptsCommand::Feedback {
                invocation_id,
                slug,
                version,
                signal,
                text,
            } => {
                prompts::handle_feedback(
                    &client,
                    invocation_id.as_deref(),
                    slug.as_deref(),
                    &version,
                    &signal,
                    text.as_deref(),
                    format,
                )
                .await
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
        Command::Console { command } => match command {
            None => console::handle_console_open().await,
            Some(ConsoleCommand::Status) | Some(ConsoleCommand::Health) => {
                console::handle_console_status(&client, format).await
            }
            Some(ConsoleCommand::Sessions) => {
                console::handle_console_sessions(&client, format).await
            }
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
        Command::Relay { action } => match action {
            RelayCommand::Auth { name } => relay::handle_auth(&client, name).await,
            RelayCommand::Start { bind } => relay::handle_start(&client, &bind).await,
            RelayCommand::Stop => relay::handle_stop().await,
            RelayCommand::Status => relay::handle_status(&client, format).await,
            RelayCommand::Sessions => relay::handle_sessions(&client, format).await,
        },
        Command::Chat {
            prompt,
            session,
            model,
            gateway_url,
            action,
        } => {
            // `token` is already resolved above from cli.token / env /
            // config. Pass it through so chat uses the same Bearer JWT.
            let opts = chat::ChatRunOpts {
                prompt: prompt.clone(),
                session_id: session.clone(),
                model: model.clone(),
                gateway_url: gateway_url.clone(),
                token_override: token.clone(),
                ca_cert_path: cli.cacert.clone(),
                // BRO-1189 — `user` / `project` are not yet exposed as
                // dedicated CLI flags (kept out of the Phase B.1 PR to
                // keep the flag surface focused). Callers pin them via
                // `BROOMVA_USER_ID` + `BROOMVA_PROJECT_ID` env vars or
                // by relying on the dev-token-shortcut derivation.
                user_id_override: None,
                project_id_override: None,
            };
            match action {
                None => {
                    if prompt.is_some() {
                        chat::handle_one_shot(opts).await
                    } else {
                        chat::handle_interactive(opts).await
                    }
                }
                Some(ChatCommand::Resume { session_id }) => {
                    chat::handle_resume(opts, session_id).await
                }
                Some(ChatCommand::Sessions { action }) => match action {
                    ChatSessionsCommand::List => chat::handle_list_sessions(),
                    ChatSessionsCommand::Prune {
                        older_than,
                        dry_run,
                    } => chat::handle_prune_sessions(older_than, dry_run),
                },
                Some(ChatCommand::Models) => chat::handle_models(),
            }
        }
        Command::Agent {
            action,
            lifed_url,
            turn_timeout,
        } => {
            let opts = agent::AgentRunOpts {
                lifed_url: lifed_url.clone(),
                token: token.clone(),
                format,
                turn_timeout_seconds: turn_timeout,
                ca_cert_path: cli.cacert.clone(),
                broomva_client: BroomvaClient::new(
                    config::resolve_api_base(cli.api_base.as_deref())?,
                    token.clone(),
                ),
            };
            match action {
                AgentCommand::Run {
                    task,
                    inline,
                    watch,
                    detach,
                    dry_run,
                    max_cost,
                    skip_output_validation,
                } => {
                    if task.is_none() && inline.is_none() {
                        return Err(crate::error::BroomvaError::User(
                            "agent run requires either <task.yaml> or --inline '<json>'".into(),
                        ));
                    }
                    let task_path = task.unwrap_or_else(|| std::path::PathBuf::from(""));
                    agent::handle_run(
                        opts,
                        task_path,
                        inline,
                        watch,
                        detach,
                        dry_run,
                        max_cost,
                        skip_output_validation,
                    )
                    .await
                }
                AgentCommand::List { status, limit } => {
                    let status_enum = status.as_deref().map(parse_run_status).transpose()?;
                    agent::handle_list(opts, status_enum, limit).await
                }
                AgentCommand::Get { run_id } => agent::handle_get(opts, run_id).await,
                AgentCommand::Tail {
                    run_id,
                    from_sequence,
                } => agent::handle_tail(opts, run_id, from_sequence).await,
                AgentCommand::Cancel { run_id } => agent::handle_cancel(opts, run_id).await,
                AgentCommand::Templates { action } => match action {
                    AgentTemplatesCommand::List => agent::handle_templates_list(),
                    AgentTemplatesCommand::Show { name } => agent::handle_templates_show(name),
                    AgentTemplatesCommand::Init { force } => agent::handle_templates_init(force),
                },
            }
        }
    }
}

fn parse_run_status(s: &str) -> BroomvaResult<crate::api::lifed::RunStatus> {
    use crate::api::lifed::RunStatus;
    match s {
        "queued" => Ok(RunStatus::Queued),
        "running" => Ok(RunStatus::Running),
        "completed" => Ok(RunStatus::Completed),
        "failed" => Ok(RunStatus::Failed),
        "cancelled" => Ok(RunStatus::Cancelled),
        other => Err(crate::error::BroomvaError::User(format!(
            "unknown status: {other}"
        ))),
    }
}

fn resolve_format_from_parts(format: OutputFormat, _no_color: bool) -> OutputFormat {
    // CLI flag takes precedence.
    if format != OutputFormat::Table {
        return format;
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
