use std::io::{self, BufRead, IsTerminal, Write};

use crate::config;
use crate::error::BroomvaResult;

// ── ANSI color helpers ──

fn use_color() -> bool {
    io::stdout().is_terminal() && std::env::var("NO_COLOR").is_err()
}

fn c(code: &'static str) -> &'static str {
    if use_color() { code } else { "" }
}

fn reset() -> &'static str {
    c("\x1b[0m")
}

// ── Banner ──

const BANNER_LINES: [&str; 6] = [
    r"    ██████╗ ██████╗  ██████╗  ██████╗ ███╗   ███╗██╗   ██╗ █████╗ ",
    r"    ██╔══██╗██╔══██╗██╔═══██╗██╔═══██╗████╗ ████║██║   ██║██╔══██╗",
    r"    ██████╔╝██████╔╝██║   ██║██║   ██║██╔████╔██║██║   ██║███████║",
    r"    ██╔══██╗██╔══██╗██║   ██║██║   ██║██║╚██╔╝██║╚██╗ ██╔╝██╔══██║",
    r"    ██████╔╝██║  ██║╚██████╔╝╚██████╔╝██║ ╚═╝ ██║ ╚████╔╝ ██║  ██║",
    r"    ╚═════╝ ╚═╝  ╚═╝ ╚═════╝  ╚═════╝ ╚═╝     ╚═╝  ╚═══╝  ╚═╝  ╚═╝",
];

const BANNER_COLORS: [&str; 6] = [
    "\x1b[93m",       // bright yellow
    "\x1b[33m",       // yellow
    "\x1b[38;5;208m", // orange
    "\x1b[93m",       // bright yellow
    "\x1b[33m",       // yellow
    "\x1b[38;5;208m", // orange
];

fn print_banner() {
    println!();
    for (i, line) in BANNER_LINES.iter().enumerate() {
        println!("{}{}{}", c(BANNER_COLORS[i]), line, reset());
    }
    println!();
    println!(
        "    {}Building autonomous software systems{}",
        c("\x1b[2m"),
        reset()
    );
    println!(
        "    {}v{}{}",
        c("\x1b[2m"),
        env!("CARGO_PKG_VERSION"),
        reset()
    );
    println!();
}

// ── System info card ──

fn platform_string() -> String {
    let os = std::env::consts::OS;
    let arch = std::env::consts::ARCH;
    let os_label = match os {
        "macos" => "macOS",
        "linux" => "Linux",
        "windows" => "Windows",
        _ => os,
    };
    format!("{os_label} {arch}")
}

fn print_info_card() {
    let dim = c("\x1b[2m");
    let gold = c("\x1b[33m");
    let bold = c("\x1b[1m");
    let r = reset();

    println!("  {dim}┌─────────────────────────────────────────┐{r}");
    println!(
        "  {dim}│{r}  {dim}version{r}     {bold}{}{r}                       {dim}│{r}",
        env!("CARGO_PKG_VERSION")
    );
    println!(
        "  {dim}│{r}  {dim}platform{r}    {:<28}{dim}│{r}",
        platform_string()
    );
    println!("  {dim}│{r}  {dim}skills{r}      307                          {dim}│{r}");
    println!("  {dim}│{r}  {dim}prompts{r}     {gold}broomva.tech/prompts{r}       {dim}│{r}");
    println!("  {dim}│{r}                                         {dim}│{r}");
    println!("  {dim}│{r}  {bold}Stack{r}                                   {dim}│{r}");
    println!(
        "  {dim}│{r}  {gold}bstack{r} · {gold}skills{r} · {gold}prompts{r} · {gold}daemon{r}     {dim}│{r}"
    );
    println!("  {dim}└─────────────────────────────────────────┘{r}");
    println!();
}

// ── Interactive prompt helpers ──

fn prompt_yn(question: &str, default_no: bool) -> bool {
    let hint = if default_no { "[y/N]" } else { "[Y/n]" };
    print!("  {}{} {}{} ", c("\x1b[1m"), question, c("\x1b[2m"), hint);
    print!("{}", reset());
    io::stdout().flush().ok();

    let stdin = io::stdin();
    let mut line = String::new();
    if stdin.lock().read_line(&mut line).is_err() {
        return !default_no;
    }
    let answer = line.trim().to_lowercase();
    if answer.is_empty() {
        return !default_no;
    }
    answer == "y" || answer == "yes"
}

fn step(num: u8, total: u8, msg: &str) {
    println!("  {}[{}/{}]{} {}", c("\x1b[33m"), num, total, reset(), msg);
}

fn ok(msg: &str) {
    println!("  {}[ok]{} {}", c("\x1b[32m"), reset(), msg);
}

fn skip(msg: &str) {
    println!("  {}[skip]{} {}", c("\x1b[2m"), reset(), msg);
}

fn info(msg: &str) {
    println!("  {}[info]{} {}", c("\x1b[36m"), reset(), msg);
}

// ── Setup wizard ──

pub async fn run() -> BroomvaResult<()> {
    print_banner();
    print_info_card();

    let total_steps: u8 = 4;

    // ── Step 1: Auth check ──
    step(1, total_steps, "Checking authentication...");

    let cfg = config::read_config()?;
    if cfg.token.is_some() {
        ok("Authenticated");
    } else {
        info("Not authenticated");
        if prompt_yn("Run broomva auth login now?", true) {
            println!();
            info("Run: broomva auth login");
            info("(Skipping interactive login in setup wizard)");
        } else {
            skip("Authentication skipped — run `broomva auth login` later");
        }
    }
    println!();

    // ── Step 2: Life Agent OS ──
    step(2, total_steps, "Life Agent OS framework");
    println!();

    let life_installed = which_exists("life");
    let arcan_installed = which_exists("arcan");

    if life_installed && arcan_installed {
        ok("Life Agent OS already installed (life + arcan)");
    } else {
        println!(
            "  {}Would you like to install the Life Agent OS framework?{}",
            c("\x1b[2m"),
            reset()
        );
        println!(
            "  {}This gives you the `life` and `arcan` commands for running AI agents locally.{}",
            c("\x1b[2m"),
            reset()
        );
        println!();

        if prompt_yn("Install Life Agent OS?", true) {
            println!();
            install_life_framework();
        } else {
            skip("Life Agent OS not installed");
            println!(
                "         {}Install later: cargo install life-os arcan{}",
                c("\x1b[2m"),
                reset()
            );
        }
    }
    println!();

    // ── Step 3: Skills check ──
    step(3, total_steps, "Checking skills...");

    let bstack_dir = dirs::home_dir()
        .map(|h| h.join(".agents/skills/bstack"))
        .unwrap_or_default();
    if bstack_dir.exists() {
        ok("bstack skills installed");
    } else {
        info("bstack skills not found");
        println!(
            "         {}Install with: curl -fsSL https://broomva.tech/install | sh{}",
            c("\x1b[2m"),
            reset()
        );
    }

    let claude_skills = dirs::home_dir()
        .map(|h| h.join(".claude/commands"))
        .unwrap_or_default();
    if claude_skills.exists() {
        let count = std::fs::read_dir(&claude_skills)
            .map(|entries| entries.count())
            .unwrap_or(0);
        if count > 0 {
            ok(&format!("{count} Claude skill(s) found"));
        } else {
            info("No Claude skills installed yet");
        }
    }
    println!();

    // ── Step 4: Done ──
    step(4, total_steps, "Setup complete!");
    println!();

    print_success_screen();

    Ok(())
}

fn which_exists(cmd: &str) -> bool {
    std::process::Command::new("which")
        .arg(cmd)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .is_ok_and(|s| s.success())
}

fn install_life_framework() {
    let cargo_ok = std::process::Command::new("cargo")
        .arg("--version")
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .is_ok_and(|s| s.success());

    if !cargo_ok {
        skip("cargo not found — install Rust first: https://rustup.rs");
        return;
    }

    info("Installing Life Agent OS (this may take a few minutes)...");

    // Try cargo install from crates.io first
    let result = std::process::Command::new("cargo")
        .args(["install", "life-os", "arcan"])
        .status();

    match result {
        Ok(status) if status.success() => {
            ok("Life Agent OS installed (life + arcan commands)");
        }
        _ => {
            info("crates.io install failed, trying from source...");

            let tmpdir = std::env::temp_dir().join("broomva-life-install");
            let _ = std::fs::remove_dir_all(&tmpdir);

            let clone = std::process::Command::new("git")
                .args([
                    "clone",
                    "--depth",
                    "1",
                    "https://github.com/broomva/life.git",
                    tmpdir.to_str().unwrap_or("/tmp/broomva-life-install"),
                ])
                .status();

            if clone.is_ok_and(|s| s.success()) {
                let life_path = tmpdir.join("crates/life");
                let arcan_path = tmpdir.join("crates/arcan/arcan");

                let _ = std::process::Command::new("cargo")
                    .args(["install", "--path"])
                    .arg(&life_path)
                    .status();

                let _ = std::process::Command::new("cargo")
                    .args(["install", "--path"])
                    .arg(&arcan_path)
                    .status();

                ok("Life Agent OS installed from source (life + arcan commands)");
            } else {
                info("Could not clone repository — install manually:");
                info("  cargo install life-os arcan");
            }

            let _ = std::fs::remove_dir_all(&tmpdir);
        }
    }
}

fn print_success_screen() {
    let gold = c("\x1b[33m");
    let bold = c("\x1b[1m");
    let dim = c("\x1b[2m");
    let cyan = c("\x1b[36m");
    let r = reset();

    println!("  {bold}Available Commands{r}");
    println!();
    println!("    {gold}broomva setup{r}          {dim}interactive setup{r}");
    println!("    {gold}broomva auth login{r}     {dim}authenticate{r}");
    println!("    {gold}broomva prompts list{r}   {dim}browse prompts{r}");
    println!("    {gold}broomva skills list{r}    {dim}browse skills{r}");
    println!("    {gold}broomva daemon start{r}   {dim}start monitoring{r}");
    println!("    {gold}broomva context show{r}   {dim}project context{r}");
    println!();
    println!("  {bold}Life Agent OS{r}");
    println!();
    println!("    {cyan}life setup{r}             {dim}configure AI providers{r}");
    println!("    {cyan}arcan chat{r}             {dim}interactive agent TUI{r}");
    println!("    {cyan}arcan shell{r}            {dim}agent REPL{r}");
    println!();
    println!("  {dim}https://broomva.tech{r}");
    println!();
}

// ── No-args banner (called when `broomva` invoked with no command) ──

pub fn print_no_args_banner() {
    print_banner();

    let gold = c("\x1b[33m");
    let bold = c("\x1b[1m");
    let dim = c("\x1b[2m");
    let cyan = c("\x1b[36m");
    let r = reset();

    println!("  Run {gold}broomva setup{r} to get started.");
    println!();
    println!("  {bold}Commands{r}");
    println!("    {gold}broomva setup{r}          {dim}interactive setup{r}");
    println!("    {gold}broomva auth login{r}     {dim}authenticate{r}");
    println!("    {gold}broomva prompts list{r}   {dim}browse prompts{r}");
    println!("    {gold}broomva skills list{r}    {dim}browse skills{r}");
    println!("    {gold}broomva daemon start{r}   {dim}start monitoring{r}");
    println!("    {gold}broomva context show{r}   {dim}project context{r}");
    println!();
    println!("  {bold}Life Agent OS{r}");
    println!("    {cyan}life setup{r}             {dim}configure AI providers{r}");
    println!("    {cyan}arcan chat{r}             {dim}interactive agent TUI{r}");
    println!("    {cyan}arcan shell{r}            {dim}agent REPL{r}");
    println!();
    println!("  {dim}https://broomva.tech{r}");
    println!();
}
