use std::path::PathBuf;

/// Errors surfaced by the core engine. Every variant maps to a user-facing
/// `{title, message, actions}` in [`UserError`] so the UI never shows a raw
/// technical string unless the user has enabled developer mode.
#[derive(Debug, thiserror::Error)]
pub enum CoreError {
    #[error("file not found: {0}")]
    NotFound(PathBuf),

    #[error("this file type isn't supported for transcription")]
    UnsupportedMedia { detail: String },

    #[error("the media file appears to be corrupt or unreadable")]
    CorruptMedia { detail: String },

    #[error("no audio track was found in this file")]
    NoAudioTrack,

    #[error("the selected range is not valid")]
    InvalidRange { start: f64, end: f64, duration: f64 },

    #[error("a required helper program is missing: {0}")]
    MissingDependency(String),

    #[error("ffmpeg failed while preparing audio")]
    Ffmpeg { code: Option<i32>, stderr: String },

    #[error("the transcription model file is missing or unreadable: {0}")]
    ModelUnavailable(PathBuf),

    #[error("the transcription model file looks incomplete or corrupt")]
    ModelCorrupt { detail: String },

    #[error("model download failed")]
    Download { detail: String },

    #[error("checksum mismatch after download (expected {expected}, got {actual})")]
    ChecksumMismatch { expected: String, actual: String },

    #[error("not enough free disk space (need ~{needed_mb} MB, have {available_mb} MB)")]
    LowDiskSpace { needed_mb: u64, available_mb: u64 },

    #[error("transcription failed: {0}")]
    Transcription(String),

    #[error("the operation was cancelled")]
    Cancelled,

    #[error(transparent)]
    Io(#[from] std::io::Error),

    #[error("unexpected error: {0}")]
    Other(String),
}

impl CoreError {
    /// Machine-readable code for telemetry / UI branching.
    pub fn code(&self) -> &'static str {
        match self {
            CoreError::NotFound(_) => "not_found",
            CoreError::UnsupportedMedia { .. } => "unsupported_media",
            CoreError::CorruptMedia { .. } => "corrupt_media",
            CoreError::NoAudioTrack => "no_audio_track",
            CoreError::InvalidRange { .. } => "invalid_range",
            CoreError::MissingDependency(_) => "missing_dependency",
            CoreError::Ffmpeg { .. } => "ffmpeg_failed",
            CoreError::ModelUnavailable(_) => "model_unavailable",
            CoreError::ModelCorrupt { .. } => "model_corrupt",
            CoreError::Download { .. } => "download_failed",
            CoreError::ChecksumMismatch { .. } => "checksum_mismatch",
            CoreError::LowDiskSpace { .. } => "low_disk_space",
            CoreError::Transcription(_) => "transcription_failed",
            CoreError::Cancelled => "cancelled",
            CoreError::Io(_) => "io_error",
            CoreError::Other(_) => "unexpected",
        }
    }

    /// Friendly, plain-language rendering for ordinary users.
    pub fn to_user(&self) -> UserError {
        let (title, message, actions): (&str, String, Vec<&str>) = match self {
            CoreError::NotFound(p) => (
                "We couldn't find that file",
                format!("{} is no longer where we expected it.", display_path(p)),
                vec!["Choose the file again"],
            ),
            CoreError::UnsupportedMedia { .. } => (
                "That file type isn't supported",
                "UtterAI works with common audio and video files such as MP3, WAV, M4A, MP4 and MKV. This file doesn't look like one we can read.".into(),
                vec!["Pick a different file", "Convert it to MP3 or MP4 first"],
            ),
            CoreError::CorruptMedia { .. } => (
                "This file looks damaged",
                "We couldn't read the audio in this file. It may be incomplete or corrupted.".into(),
                vec!["Try re-downloading or re-exporting the file", "Pick a different file"],
            ),
            CoreError::NoAudioTrack => (
                "There's no audio to transcribe",
                "This file only contains video (or images) with no sound track.".into(),
                vec!["Pick a file that has audio"],
            ),
            CoreError::InvalidRange { duration, .. } => (
                "That range doesn't work",
                format!(
                    "The part you selected falls outside the media, which is {} long. Try adjusting the start and end points.",
                    crate::format_hms(*duration)
                ),
                vec!["Adjust the selection", "Transcribe the whole file"],
            ),
            CoreError::MissingDependency(name) => (
                "A required component is missing",
                format!("UtterAI needs its bundled \"{name}\" helper, and it couldn't be found. This usually means the installation is incomplete."),
                vec!["Reinstall UtterAI"],
            ),
            CoreError::Ffmpeg { .. } => (
                "We couldn't prepare the audio",
                "Something went wrong while extracting audio from this file.".into(),
                vec!["Try again", "Pick a different file", "Enable developer mode for details"],
            ),
            CoreError::ModelUnavailable(_) => (
                "The transcription model isn't ready",
                "The AI model this transcription needs isn't installed yet.".into(),
                vec!["Open Settings and download a model", "Use the built-in model"],
            ),
            CoreError::ModelCorrupt { .. } => (
                "The model file is damaged",
                "The AI model on disk failed its integrity check and needs to be downloaded again.".into(),
                vec!["Re-download the model in Settings"],
            ),
            CoreError::Download { .. } => (
                "The download didn't finish",
                "We couldn't finish downloading the model. Your connection may have dropped.".into(),
                vec!["Check your internet connection", "Try the download again"],
            ),
            CoreError::ChecksumMismatch { .. } => (
                "The download was incomplete",
                "The model file we received didn't match what we expected, so we discarded it.".into(),
                vec!["Try the download again"],
            ),
            CoreError::LowDiskSpace { needed_mb, available_mb } => (
                "Not enough disk space",
                format!("This step needs about {needed_mb} MB free, but only {available_mb} MB is available."),
                vec!["Free up some space and try again"],
            ),
            CoreError::Transcription(_) => (
                "The transcription failed",
                "Something went wrong while transcribing. Your file was not changed.".into(),
                vec!["Try again", "Try a different model", "Enable developer mode for details"],
            ),
            CoreError::Cancelled => (
                "Transcription cancelled",
                "You stopped this transcription. Nothing was saved.".into(),
                vec!["Start a new transcription"],
            ),
            CoreError::Io(_) => (
                "A file-system error occurred",
                "UtterAI couldn't read or write a file it needed.".into(),
                vec!["Check the file and folder permissions", "Try again"],
            ),
            CoreError::Other(_) => (
                "Something unexpected happened",
                "UtterAI hit a problem it didn't anticipate. Your media is untouched.".into(),
                vec!["Try again", "Restart UtterAI", "Enable developer mode for details"],
            ),
        };

        UserError {
            code: self.code().to_string(),
            title: title.to_string(),
            message,
            actions: actions.into_iter().map(str::to_string).collect(),
            detail: format!("{self}"),
        }
    }
}

fn display_path(p: &std::path::Path) -> String {
    p.file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| p.to_string_lossy().to_string())
}

/// User-facing error payload sent to the UI.
#[derive(Debug, Clone, serde::Serialize)]
pub struct UserError {
    pub code: String,
    pub title: String,
    pub message: String,
    pub actions: Vec<String>,
    /// Raw technical detail — only shown when developer mode is on.
    pub detail: String,
}

pub type Result<T> = std::result::Result<T, CoreError>;
