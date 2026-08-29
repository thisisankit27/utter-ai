//! # utterai-core
//!
//! The portable transcription engine behind UtterAI. It knows nothing about
//! Tauri, the UI or the OS beyond standard filesystem locations, so the same
//! code can back a desktop shell today and a mobile shell later.
//!
//! Pipeline: [`media::probe_media`] → [`audio::extract_range`] →
//! [`transcribe::transcribe`] → [`export::render`].

pub mod audio;
pub mod chunk;
pub mod error;
pub mod export;
pub mod media;
pub mod model;
pub mod paths;
pub mod transcribe;

pub use error::{CoreError, Result, UserError};
pub use export::ExportFormat;
pub use media::MediaInfo;
pub use model::{ModelSpec, MODELS};
pub use transcribe::{Segment, TranscribeEvent, TranscribeRequest, Transcript};

/// `H:MM:SS` (or `MM:SS`) — shared with the exporters and surfaced in errors.
pub fn format_hms(secs: f64) -> String {
    export::clock(secs)
}

/// Sensible default worker-thread count: leave one core for the UI.
pub fn default_threads() -> usize {
    std::thread::available_parallelism()
        .map(|n| (n.get().saturating_sub(1)).max(1))
        .unwrap_or(4)
}
