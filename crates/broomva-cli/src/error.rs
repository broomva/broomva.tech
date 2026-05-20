use std::io;

#[derive(Debug, thiserror::Error)]
pub enum BroomvaError {
    #[error("authentication required — run `broomva auth login`")]
    AuthRequired,

    #[error("API error {status}: {message}")]
    Api {
        status: u16,
        message: String,
        body: Option<String>,
    },

    #[error("{0}")]
    Http(#[from] reqwest::Error),

    #[error("{0}")]
    Config(String),

    #[error("{0}")]
    Io(#[from] io::Error),

    #[error("{0}")]
    Json(#[from] serde_json::Error),

    #[error("{0}")]
    User(String),

    /// Surface used by features that compile but are not yet wired to
    /// a real substrate (BRO-1189 / BRO-1190). The message embeds the
    /// follow-up ticket so operators can route the gap appropriately.
    #[error("unsupported: {0}")]
    Unsupported(String),
}

pub type BroomvaResult<T> = Result<T, BroomvaError>;
