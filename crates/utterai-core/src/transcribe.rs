//! Local speech-to-text via whisper.cpp (through `whisper-rs`).
//!
//! The pipeline is: probe → extract the selected range to 16 kHz mono →
//! load the model → run Whisper (streaming progress + partial text) →
//! chunk into readable + timestamped segments.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Instant;

use serde::{Deserialize, Serialize};
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

use crate::audio;
use crate::chunk;
use crate::error::{CoreError, Result};
use crate::media;
use crate::paths::{self, ScratchFile};

/// One transcript line with timing, in seconds.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Segment {
    pub start: f64,
    pub end: f64,
    pub text: String,
}

/// The finished result handed back to the UI and to the exporters.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Transcript {
    /// Caption-sized, timestamped lines.
    pub segments: Vec<Segment>,
    /// Longer flowing paragraphs for comfortable reading.
    pub paragraphs: Vec<Segment>,
    pub language: String,
    pub model_id: String,
    /// Duration of the transcribed span (not necessarily the whole file).
    pub duration: f64,
    /// Offset of the transcribed span within the source media.
    pub source_offset: f64,
    pub source_name: String,
}

#[derive(Debug, Clone)]
pub struct TranscribeRequest {
    pub input: PathBuf,
    /// `None` transcribes the whole file.
    pub range: Option<(f64, f64)>,
    pub model_path: PathBuf,
    pub model_id: String,
    /// `None` auto-detects.
    pub language: Option<String>,
    /// Translate non-English speech to English instead of transcribing verbatim.
    pub translate: bool,
    pub threads: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Stage {
    Preparing,
    Extracting,
    LoadingModel,
    Transcribing,
    Finalizing,
}

/// Progress signals emitted during a run. The Tauri layer turns these into a
/// single overall percentage + ETA + a live transcript preview.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum TranscribeEvent {
    Stage { stage: Stage, note: String },
    ExtractProgress { fraction: f32 },
    TranscribeProgress { fraction: f32 },
    PartialSegment { segment: Segment },
}

pub type EventSink = Arc<dyn Fn(TranscribeEvent) + Send + Sync>;

pub fn transcribe(
    req: &TranscribeRequest,
    ffmpeg: &Path,
    ffprobe: &Path,
    cancel: Arc<AtomicBool>,
    sink: EventSink,
) -> Result<Transcript> {
    let check_cancel = || {
        if cancel.load(Ordering::Relaxed) {
            Err(CoreError::Cancelled)
        } else {
            Ok(())
        }
    };

    // ---- 1. Prepare --------------------------------------------------------
    sink(TranscribeEvent::Stage {
        stage: Stage::Preparing,
        note: "Checking the file".into(),
    });
    let input = paths::validate_input_file(&req.input)?;
    let info = media::probe_media(ffprobe, &input)?;
    check_cancel()?;

    let (start, end) = match req.range {
        Some((s, e)) => (s.max(0.0), e.min(info.duration_secs)),
        None => (0.0, info.duration_secs),
    };
    if end - start < 0.05 {
        return Err(CoreError::InvalidRange {
            start,
            end,
            duration: info.duration_secs,
        });
    }
    let span = end - start;

    if !req.model_path.exists() {
        return Err(CoreError::ModelUnavailable(req.model_path.clone()));
    }

    // ---- 2. Extract ------------------------------------------------------
    sink(TranscribeEvent::Stage {
        stage: Stage::Extracting,
        note: "Preparing the audio".into(),
    });
    let scratch = ScratchFile::new("wav")?;
    paths::require_space(scratch.path(), (span * 32_000.0) as u64 + 4 * 1_048_576)?;
    {
        let sink = sink.clone();
        let on_progress = move |f: Option<f32>| {
            if let Some(f) = f {
                sink(TranscribeEvent::ExtractProgress { fraction: f });
            }
        };
        audio::extract_range(
            ffmpeg,
            &input,
            scratch.path(),
            start,
            end,
            &cancel,
            &on_progress,
        )?;
    }
    check_cancel()?;

    let samples = audio::read_wav_mono_f32(scratch.path())?;
    if samples.is_empty() {
        return Err(CoreError::Ffmpeg {
            code: None,
            stderr: "the selected range contains no audio".into(),
        });
    }

    // ---- 3. Load model --------------------------------------------------
    sink(TranscribeEvent::Stage {
        stage: Stage::LoadingModel,
        note: "Loading the transcription model".into(),
    });
    whisper_rs::install_logging_hooks();
    let ctx = WhisperContext::new_with_params(&req.model_path, WhisperContextParameters::default())
        .map_err(|e| CoreError::ModelCorrupt {
            detail: e.to_string(),
        })?;
    let mut state = ctx
        .create_state()
        .map_err(|e| CoreError::Transcription(e.to_string()))?;
    check_cancel()?;

    // ---- 4. Transcribe -----------------------------------------------
    sink(TranscribeEvent::Stage {
        stage: Stage::Transcribing,
        note: "Transcribing".into(),
    });

    let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
    params.set_n_threads(req.threads.max(1) as i32);
    params.set_translate(req.translate);
    match &req.language {
        Some(lang) if lang != "auto" => params.set_language(Some(lang.as_str())),
        _ => {
            params.set_language(Some("auto"));
            params.set_detect_language(true);
        }
    }
    params.set_print_special(false);
    params.set_print_progress(false);
    params.set_print_realtime(false);
    params.set_print_timestamps(false);
    params.set_suppress_blank(true);
    params.set_token_timestamps(true);
    params.set_split_on_word(true);
    // Keep individual segments to roughly one caption line.
    params.set_max_len(80);
    params.enable_vad(false);

    {
        let sink = sink.clone();
        params.set_progress_callback_safe(move |p: i32| {
            sink(TranscribeEvent::TranscribeProgress {
                fraction: (p as f32 / 100.0).clamp(0.0, 1.0),
            });
        });
    }
    {
        let sink = sink.clone();
        params.set_segment_callback_safe_lossy(move |data: whisper_rs::SegmentCallbackData| {
            let seg = Segment {
                start: start + data.start_timestamp as f64 / 100.0,
                end: start + data.end_timestamp as f64 / 100.0,
                text: data.text.trim().to_string(),
            };
            if !seg.text.is_empty() {
                sink(TranscribeEvent::PartialSegment { segment: seg });
            }
        });
    }
    {
        let cancel = cancel.clone();
        params.set_abort_callback_safe(move || cancel.load(Ordering::Relaxed));
    }

    let started = Instant::now();
    state
        .full(params, &samples)
        .map_err(|e| CoreError::Transcription(e.to_string()))?;
    if cancel.load(Ordering::Relaxed) {
        return Err(CoreError::Cancelled);
    }
    tracing::info!(
        elapsed_ms = started.elapsed().as_millis(),
        "whisper full() done"
    );

    // ---- 5. Finalize -----------------------------------------------
    sink(TranscribeEvent::Stage {
        stage: Stage::Finalizing,
        note: "Tidying up the transcript".into(),
    });

    let mut raw: Vec<Segment> = Vec::new();
    for seg in state.as_iter() {
        let text = seg
            .to_str_lossy()
            .map(|c| c.trim().to_string())
            .unwrap_or_default();
        if text.is_empty() {
            continue;
        }
        raw.push(Segment {
            start: start + seg.start_timestamp() as f64 / 100.0,
            end: start + seg.end_timestamp() as f64 / 100.0,
            text,
        });
    }

    let lang_id = state.full_lang_id_from_state();
    let language = whisper_rs::get_lang_str(lang_id)
        .map(str::to_string)
        .or_else(|| req.language.clone())
        .unwrap_or_else(|| "auto".into());
    tracing::info!(%language, segments = raw.len(), "transcript assembled");

    let segments = chunk::captionize(&raw);
    let paragraphs = chunk::paragraphize(&raw);

    Ok(Transcript {
        segments,
        paragraphs,
        language,
        model_id: req.model_id.clone(),
        duration: span,
        source_offset: start,
        source_name: input
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default(),
    })
}
