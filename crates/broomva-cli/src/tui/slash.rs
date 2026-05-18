//! Slash-command parser for the chat REPL.
//!
//! The chat REPL recognizes six commands inside the input prompt:
//!
//! - `/save` — flush the current session JSONL to disk and print the
//!   path (mostly a no-op since we write-through, but useful as a
//!   confirmation).
//! - `/model <id>` — switch the model used by subsequent turns.
//! - `/history` — print the current session's transcript.
//! - `/clear` — clear screen and reset display state (session
//!   continues; only the screen clears).
//! - `/exit` — exit the REPL gracefully.
//! - `/help` — print the help text.
//!
//! Parser is pure — no I/O — so it's trivially unit-testable. The REPL
//! decides what to do with each parsed variant.

/// Parsed slash command.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SlashCommand {
    Save,
    Model { id: String },
    History,
    Clear,
    Exit,
    Help,
}

/// Errors the parser can return. Each maps to a user-readable line
/// the REPL prints back when a command is malformed.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SlashCommandParseError {
    /// The input started with `/` but the command name wasn't one we
    /// recognize. The REPL falls back to "treat as a user turn" if
    /// the user prefers that — but the default is to print this error.
    UnknownCommand { name: String },
    /// `/model` was invoked without an `<id>` argument.
    ModelMissingArg,
}

impl std::fmt::Display for SlashCommandParseError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::UnknownCommand { name } => {
                write!(f, "unknown command: /{name} — try /help")
            }
            Self::ModelMissingArg => {
                write!(
                    f,
                    "/model requires an argument (try /model claude-sonnet-4-6)"
                )
            }
        }
    }
}

impl SlashCommand {
    /// Parse user input. Returns `Ok(None)` when the input is **not**
    /// a slash command (i.e. it's a regular user turn). Returns
    /// `Ok(Some(cmd))` when a valid command is parsed. Returns
    /// `Err(...)` for malformed commands.
    pub fn parse(input: &str) -> Result<Option<Self>, SlashCommandParseError> {
        let trimmed = input.trim();
        if !trimmed.starts_with('/') {
            return Ok(None);
        }
        // Strip the leading slash, then split off the command name +
        // optional argument(s).
        let body = &trimmed[1..];
        let mut parts = body.splitn(2, char::is_whitespace);
        let name = parts.next().unwrap_or("").to_ascii_lowercase();
        let arg = parts.next().map(|s| s.trim()).unwrap_or("");

        match name.as_str() {
            "save" => Ok(Some(Self::Save)),
            "model" => {
                if arg.is_empty() {
                    Err(SlashCommandParseError::ModelMissingArg)
                } else {
                    // Reject anything containing whitespace inside the
                    // model name — model IDs are tokens.
                    let id = arg.split_whitespace().next().unwrap_or("").to_string();
                    if id.is_empty() {
                        Err(SlashCommandParseError::ModelMissingArg)
                    } else {
                        Ok(Some(Self::Model { id }))
                    }
                }
            }
            "history" => Ok(Some(Self::History)),
            "clear" => Ok(Some(Self::Clear)),
            "exit" | "quit" | "q" => Ok(Some(Self::Exit)),
            "help" | "h" | "?" => Ok(Some(Self::Help)),
            other => Err(SlashCommandParseError::UnknownCommand {
                name: other.to_string(),
            }),
        }
    }

    /// Help text shown by `/help`.
    pub const HELP_TEXT: &'static str = "  Slash commands:\n\
        \x20   /save             — confirm the session JSONL is on disk\n\
        \x20   /model <id>       — switch model for subsequent turns\n\
        \x20   /history          — print the current session transcript\n\
        \x20   /clear            — clear the screen (session keeps going)\n\
        \x20   /exit             — exit the REPL\n\
        \x20   /help             — show this help\n\
        \x20\n\
        \x20Tips:\n\
        \x20   Press ESC during a streaming reply to cancel it.\n\
        \x20   Anything not starting with `/` is sent as a chat turn.\n";
}

// ── Tests ────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_returns_none_for_regular_input() {
        assert_eq!(SlashCommand::parse("hello there").unwrap(), None);
        assert_eq!(SlashCommand::parse("").unwrap(), None);
        assert_eq!(SlashCommand::parse("   ").unwrap(), None);
        // A `/` mid-line shouldn't count as a slash command.
        assert_eq!(SlashCommand::parse("foo/bar").unwrap(), None);
    }

    #[test]
    fn parse_recognizes_each_command() {
        assert_eq!(
            SlashCommand::parse("/save").unwrap(),
            Some(SlashCommand::Save)
        );
        assert_eq!(
            SlashCommand::parse("/history").unwrap(),
            Some(SlashCommand::History)
        );
        assert_eq!(
            SlashCommand::parse("/clear").unwrap(),
            Some(SlashCommand::Clear)
        );
        assert_eq!(
            SlashCommand::parse("/exit").unwrap(),
            Some(SlashCommand::Exit)
        );
        assert_eq!(
            SlashCommand::parse("/help").unwrap(),
            Some(SlashCommand::Help)
        );
    }

    #[test]
    fn parse_command_names_are_case_insensitive() {
        assert_eq!(
            SlashCommand::parse("/EXIT").unwrap(),
            Some(SlashCommand::Exit)
        );
        assert_eq!(
            SlashCommand::parse("/Help").unwrap(),
            Some(SlashCommand::Help)
        );
    }

    #[test]
    fn parse_accepts_short_aliases() {
        assert_eq!(SlashCommand::parse("/q").unwrap(), Some(SlashCommand::Exit));
        assert_eq!(
            SlashCommand::parse("/quit").unwrap(),
            Some(SlashCommand::Exit)
        );
        assert_eq!(SlashCommand::parse("/?").unwrap(), Some(SlashCommand::Help));
        assert_eq!(SlashCommand::parse("/h").unwrap(), Some(SlashCommand::Help));
    }

    #[test]
    fn parse_model_requires_arg() {
        let err = SlashCommand::parse("/model").unwrap_err();
        assert_eq!(err, SlashCommandParseError::ModelMissingArg);
        let err = SlashCommand::parse("/model   ").unwrap_err();
        assert_eq!(err, SlashCommandParseError::ModelMissingArg);
    }

    #[test]
    fn parse_model_extracts_first_token() {
        assert_eq!(
            SlashCommand::parse("/model claude-sonnet-4-6").unwrap(),
            Some(SlashCommand::Model {
                id: "claude-sonnet-4-6".into()
            })
        );
        // Extra args are silently dropped (forward-compat).
        assert_eq!(
            SlashCommand::parse("/model claude-opus-4-7   --temp 0.0").unwrap(),
            Some(SlashCommand::Model {
                id: "claude-opus-4-7".into()
            })
        );
    }

    #[test]
    fn parse_unknown_command_is_rejected() {
        let err = SlashCommand::parse("/foo").unwrap_err();
        assert_eq!(
            err,
            SlashCommandParseError::UnknownCommand {
                name: "foo".to_string()
            }
        );
    }

    #[test]
    fn parse_handles_leading_whitespace_then_slash() {
        // Trimmed input — agents may prepend whitespace.
        assert_eq!(
            SlashCommand::parse("   /exit").unwrap(),
            Some(SlashCommand::Exit)
        );
    }
}
