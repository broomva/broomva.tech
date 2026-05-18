//! Shared TUI primitives for `broomva chat` (Phase A) and the future
//! `broomva agent` / `broomva pipeline` surfaces.
//!
//! Three concerns:
//!
//! 1. **Typewriter rendering** — token-level write-then-flush to stdout
//!    so streaming feels live (CC-3 from spec §3.1).
//! 2. **Slash-command parsing** — pure-function `SlashCommand::parse`
//!    so the REPL can dispatch without touching the terminal.
//! 3. **ESC interrupt** — non-blocking poll on `crossterm::event` so a
//!    user can cancel an in-flight token stream.
//!
//! The module is deliberately I/O-light: anything that touches stdout
//! goes through a `Renderer` struct so tests can swap it for an
//! in-memory `Vec<u8>` writer.

use std::io::{self, Write};
use std::time::Duration;

pub mod slash;

pub use slash::{SlashCommand, SlashCommandParseError};

/// A renderer abstracts the typewriter output sink so tests can swap
/// stdout for a `Vec<u8>` buffer.
pub trait Renderer: Send {
    /// Write a token to the sink. Implementations should flush eagerly
    /// so streaming is visible to the user (CC-3 invariant).
    fn write_token(&mut self, token: &str) -> io::Result<()>;
    /// Emit a line break (called between turns).
    fn write_line(&mut self) -> io::Result<()>;
    /// Emit a system notice (e.g. "reconnecting…"). Should be visually
    /// distinct from streamed tokens (dim color in stdout impl).
    fn write_notice(&mut self, notice: &str) -> io::Result<()>;
    /// Emit a hard error (red in stdout impl).
    fn write_error(&mut self, message: &str) -> io::Result<()>;
}

/// Production renderer — writes to stdout with ANSI dim for notices
/// and ANSI red for errors.
pub struct StdoutRenderer {
    out: io::Stdout,
    color: bool,
}

impl Default for StdoutRenderer {
    fn default() -> Self {
        Self {
            out: io::stdout(),
            color: use_color(),
        }
    }
}

fn use_color() -> bool {
    use std::io::IsTerminal;
    io::stdout().is_terminal() && std::env::var("NO_COLOR").is_err()
}

impl Renderer for StdoutRenderer {
    fn write_token(&mut self, token: &str) -> io::Result<()> {
        let mut h = self.out.lock();
        h.write_all(token.as_bytes())?;
        h.flush()
    }

    fn write_line(&mut self) -> io::Result<()> {
        let mut h = self.out.lock();
        h.write_all(b"\n")?;
        h.flush()
    }

    fn write_notice(&mut self, notice: &str) -> io::Result<()> {
        let mut h = self.out.lock();
        if self.color {
            writeln!(h, "\x1b[2m  {notice}\x1b[0m")?;
        } else {
            writeln!(h, "  {notice}")?;
        }
        h.flush()
    }

    fn write_error(&mut self, message: &str) -> io::Result<()> {
        let mut h = self.out.lock();
        if self.color {
            writeln!(h, "\x1b[31m  error: {message}\x1b[0m")?;
        } else {
            writeln!(h, "  error: {message}")?;
        }
        h.flush()
    }
}

/// In-memory renderer used by integration tests (also available at
/// runtime if a caller wants to capture a chat session for replay).
/// Concatenates everything into a single `String`, prefixing notices
/// with `[notice] ` and errors with `[error] ` so tests can assert on
/// the trace.
#[derive(Default)]
pub struct CapturedRenderer {
    pub buffer: String,
}

impl Renderer for CapturedRenderer {
    fn write_token(&mut self, token: &str) -> io::Result<()> {
        self.buffer.push_str(token);
        Ok(())
    }
    fn write_line(&mut self) -> io::Result<()> {
        self.buffer.push('\n');
        Ok(())
    }
    fn write_notice(&mut self, notice: &str) -> io::Result<()> {
        self.buffer.push_str("[notice] ");
        self.buffer.push_str(notice);
        self.buffer.push('\n');
        Ok(())
    }
    fn write_error(&mut self, message: &str) -> io::Result<()> {
        self.buffer.push_str("[error] ");
        self.buffer.push_str(message);
        self.buffer.push('\n');
        Ok(())
    }
}

/// Non-blocking check for the ESC key. Returns `true` if the user
/// pressed ESC since the last poll. Should be called from the
/// renderer task between tokens.
///
/// Returns `false` if the terminal isn't a TTY (e.g. piped stdin) so
/// scripts can still drive the REPL.
pub fn esc_pressed() -> bool {
    use crossterm::event::{Event, KeyCode, KeyEventKind, poll, read};

    // Only poll if we're attached to a TTY. Spawning crossterm event
    // poll on a piped stdin would block.
    if !io::stdin().is_terminal() {
        return false;
    }

    if poll(Duration::from_millis(0)).unwrap_or(false)
        && let Ok(Event::Key(key)) = read()
    {
        // Crossterm fires both Press and Release on most terminals;
        // accept either so we don't miss the keystroke.
        if matches!(key.kind, KeyEventKind::Press | KeyEventKind::Release)
            && matches!(key.code, KeyCode::Esc)
        {
            return true;
        }
    }
    false
}

trait IsTerminal {
    fn is_terminal(&self) -> bool;
}

impl IsTerminal for io::Stdin {
    fn is_terminal(&self) -> bool {
        std::io::IsTerminal::is_terminal(self)
    }
}

// ── Tests ────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn captured_renderer_records_tokens_notices_errors_in_order() {
        let mut r = CapturedRenderer::default();
        r.write_token("hello ").unwrap();
        r.write_token("world").unwrap();
        r.write_line().unwrap();
        r.write_notice("reconnecting").unwrap();
        r.write_error("auth failed").unwrap();
        let s = r.buffer;
        assert!(s.starts_with("hello world\n"));
        assert!(s.contains("[notice] reconnecting"));
        assert!(s.contains("[error] auth failed"));
    }
}
