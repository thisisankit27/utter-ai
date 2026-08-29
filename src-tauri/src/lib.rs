//! UtterAI desktop shell: wires the portable [`utterai_core`] engine to a Tauri
//! window, exposing a small set of commands and a stream of progress events.

mod sidecars;
mod store;

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};

use utterai_core::export::ExportFormat;
use utterai_core::model::{self, DownloadProgress};
use utterai_core::transcribe::{Stage, TranscribeEvent, TranscribeRequest, Transcript};
use utterai_core::{media, paths};

use store::{HistoryEntry, Settings, Store};

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------

#[derive(Default)]
struct AppState {
    store: Store,
    /// Cancellation flags for in-flight transcription jobs, keyed by job id.
    jobs: Mutex<HashMap<String, Arc<AtomicBool>>>,
    /// Cancellation flag for the (single) in-flight model download.
    download_cancel: Mutex<Option<Arc<AtomicBool>>>,
}

fn new_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let n = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("{n:x}")
}

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------

#[derive(Serialize)]
struct DependencyReport {
    ffmpeg_ok: bool,
    ffprobe_ok: bool,
    bundled_model_ok: bool,
    models_installed: Vec<model::InstalledModel>,
    data_dir: String,
    free_space_mb: u64,
}

#[derive(Serialize)]
struct ModelCatalog {
    selectable: Vec<model::ModelSpec>,
    installed: Vec<model::InstalledModel>,
    default_id: String,
    bundled_id: String,
}

#[derive(Deserialize)]
struct StartRequest {
    input: String,
    range: Option<(f64, f64)>,
    model_id: Option<String>,
    language: Option<String>,
    translate: bool,
}

#[derive(Serialize, Clone)]
#[serde(tag = "phase", rename_all = "snake_case")]
enum JobUpdate {
    Progress {
        job_id: String,
        overall: f32,
        stage: String,
        note: String,
        partial: Option<utterai_core::Segment>,
    },
    Done {
        job_id: String,
        transcript: Box<Transcript>,
    },
    Failed {
        job_id: String,
        error: utterai_core::UserError,
    },
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

#[tauri::command]
fn get_settings(state: State<AppState>) -> Settings {
    state.store.settings()
}

#[tauri::command]
fn set_settings(state: State<AppState>, settings: Settings) -> Result<(), String> {
    state.store.set_settings(settings).map_err(|e| e.to_string())
}

#[tauri::command]
fn dependency_check() -> DependencyReport {
    let sc = sidecars::Sidecars::resolve();
    let bundled = model::bundled_spec();
    DependencyReport {
        ffmpeg_ok: sc.ffmpeg_ok(),
        ffprobe_ok: sc.ffprobe_ok(),
        bundled_model_ok: model::is_installed(bundled.id),
        models_installed: model::installed(),
        data_dir: paths::data_dir().to_string_lossy().to_string(),
        free_space_mb: paths::available_space(&paths::data_dir())
            .map(|b| b / 1_048_576)
            .unwrap_or(0),
    }
}

#[tauri::command]
fn list_models(state: State<AppState>) -> ModelCatalog {
    ModelCatalog {
        selectable: model::selectable().into_iter().cloned().collect(),
        installed: model::installed(),
        default_id: state.store.settings().default_model,
        bundled_id: model::bundled_spec().id.to_string(),
    }
}

#[tauri::command]
async fn probe_media(app: AppHandle, path: String) -> Result<media::MediaInfo, utterai_core::UserError> {
    let sc = sidecars::Sidecars::resolve();
    let path = PathBuf::from(path);
    tauri::async_runtime::spawn_blocking(move || {
        media::probe_media(&sc.ffprobe, &path).map_err(|e| {
            let _ = &app;
            e.to_user()
        })
    })
    .await
    .map_err(|e| utterai_core::CoreError::Other(e.to_string()).to_user())?
}

#[tauri::command]
async fn download_model(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<(), utterai_core::UserError> {
    let spec = model::find(&id)
        .ok_or_else(|| utterai_core::CoreError::Other(format!("unknown model {id}")).to_user())?;
    let cancel = Arc::new(AtomicBool::new(false));
    *state.download_cancel.lock() = Some(cancel.clone());

    let app2 = app.clone();
    let id2 = id.clone();
    let result = model::download(spec, &cancel, move |p: DownloadProgress| {
        let _ = app2.emit(
            "model://download-progress",
            serde_json::json!({
                "id": id2,
                "received": p.received_bytes,
                "total": p.total_bytes,
                "fraction": p.fraction,
            }),
        );
    })
    .await;

    *state.download_cancel.lock() = None;
    match result {
        Ok(_) => {
            let _ = app.emit("model://download-done", serde_json::json!({ "id": id }));
            Ok(())
        }
        Err(e) => Err(e.to_user()),
    }
}

#[tauri::command]
fn cancel_download(state: State<AppState>) {
    if let Some(c) = state.download_cancel.lock().as_ref() {
        c.store(true, Ordering::Relaxed);
    }
}

#[tauri::command]
fn remove_model(id: String) -> Result<(), String> {
    model::remove(&id).map_err(|e| e.to_string())
}

#[tauri::command]
async fn verify_model(id: String) -> Result<bool, String> {
    let spec = model::find(&id).ok_or("unknown model")?;
    Ok(model::verify(spec).is_ok())
}

#[tauri::command]
fn start_transcription(
    app: AppHandle,
    state: State<AppState>,
    request: StartRequest,
) -> Result<String, utterai_core::UserError> {
    let settings = state.store.settings();
    let model_id = request
        .model_id
        .filter(|m| !m.is_empty())
        .unwrap_or(settings.default_model);
    let spec = model::find(&model_id)
        .ok_or_else(|| utterai_core::CoreError::ModelUnavailable(model_id.clone().into()).to_user())?;
    let model_path = spec.installed_path();
    if !model_path.exists() {
        return Err(utterai_core::CoreError::ModelUnavailable(model_path).to_user());
    }

    let language = request
        .language
        .filter(|l| !l.is_empty() && l != "auto")
        .or(None);

    let job_id = new_id();
    let cancel = Arc::new(AtomicBool::new(false));
    state.jobs.lock().insert(job_id.clone(), cancel.clone());

    let req = TranscribeRequest {
        input: PathBuf::from(&request.input),
        range: request.range,
        model_path,
        model_id: model_id.clone(),
        language,
        translate: request.translate,
        threads: utterai_core::default_threads(),
    };

    let sc = sidecars::Sidecars::resolve();
    let app_for_thread = app.clone();
    let job_for_thread = job_id.clone();

    std::thread::spawn(move || {
        run_job(app_for_thread, job_for_thread, req, sc, cancel);
    });

    Ok(job_id)
}

fn run_job(
    app: AppHandle,
    job_id: String,
    req: TranscribeRequest,
    sc: sidecars::Sidecars,
    cancel: Arc<AtomicBool>,
) {
    // Overall-progress model: extraction 0..15%, transcription 15..96%, finalize 96..100%.
    let progress_state = Arc::new(Mutex::new(ProgressModel::default()));

    let app_sink = app.clone();
    let job_sink = job_id.clone();
    let pstate = progress_state.clone();
    let sink: utterai_core::transcribe::EventSink = Arc::new(move |ev: TranscribeEvent| {
        let mut pm = pstate.lock();
        let (overall, stage, note, partial) = pm.apply(ev);
        let _ = app_sink.emit(
            "transcription://update",
            JobUpdate::Progress {
                job_id: job_sink.clone(),
                overall,
                stage,
                note,
                partial,
            },
        );
    });

    let outcome = utterai_core::transcribe::transcribe(
        &req,
        &sc.ffmpeg,
        &sc.ffprobe,
        cancel,
        sink,
    );

    // Job is finished either way — drop its cancel handle.
    if let Some(state) = app.try_state::<AppState>() {
        state.jobs.lock().remove(&job_id);
    }

    match outcome {
        Ok(transcript) => {
            let _ = app.emit(
                "transcription://update",
                JobUpdate::Done {
                    job_id,
                    transcript: Box::new(transcript),
                },
            );
        }
        Err(err) => {
            let _ = app.emit(
                "transcription://update",
                JobUpdate::Failed {
                    job_id,
                    error: err.to_user(),
                },
            );
        }
    }
}

#[derive(Default)]
struct ProgressModel {
    stage: Option<Stage>,
    extract: f32,
    transcribe: f32,
}

impl ProgressModel {
    fn apply(&mut self, ev: TranscribeEvent) -> (f32, String, String, Option<utterai_core::Segment>) {
        let mut partial = None;
        let mut note = String::new();
        match ev {
            TranscribeEvent::Stage { stage, note: n } => {
                note = n;
                self.stage = Some(stage);
            }
            TranscribeEvent::ExtractProgress { fraction } => {
                self.extract = fraction;
                self.stage = Some(Stage::Extracting);
            }
            TranscribeEvent::TranscribeProgress { fraction } => {
                self.transcribe = fraction;
                self.stage = Some(Stage::Transcribing);
            }
            TranscribeEvent::PartialSegment { segment } => {
                partial = Some(segment);
                self.stage = Some(Stage::Transcribing);
            }
        }
        let overall = match self.stage {
            Some(Stage::Preparing) | None => 0.02,
            Some(Stage::Extracting) => 0.02 + self.extract * 0.13,
            Some(Stage::LoadingModel) => 0.16,
            Some(Stage::Transcribing) => 0.17 + self.transcribe * 0.79,
            Some(Stage::Finalizing) => 0.98,
        };
        let stage_name = match self.stage {
            Some(Stage::Preparing) | None => "preparing",
            Some(Stage::Extracting) => "extracting",
            Some(Stage::LoadingModel) => "loading_model",
            Some(Stage::Transcribing) => "transcribing",
            Some(Stage::Finalizing) => "finalizing",
        };
        if note.is_empty() {
            note = default_note(stage_name).to_string();
        }
        (overall.clamp(0.0, 1.0), stage_name.to_string(), note, partial)
    }
}

fn default_note(stage: &str) -> &'static str {
    match stage {
        "preparing" => "Checking the file",
        "extracting" => "Preparing the audio",
        "loading_model" => "Loading the transcription model",
        "transcribing" => "Transcribing",
        "finalizing" => "Tidying up the transcript",
        _ => "Working",
    }
}

#[tauri::command]
fn cancel_transcription(state: State<AppState>, job_id: String) {
    if let Some(c) = state.jobs.lock().get(&job_id) {
        c.store(true, Ordering::Relaxed);
    }
}

#[tauri::command]
fn export_transcript(
    transcript: Transcript,
    format: String,
    dest: String,
) -> Result<(), utterai_core::UserError> {
    let fmt = parse_format(&format)
        .ok_or_else(|| utterai_core::CoreError::Other(format!("unknown format {format}")).to_user())?;
    let body = utterai_core::export::render(&transcript, fmt);
    std::fs::write(&dest, body)
        .map_err(|e| utterai_core::CoreError::Io(e).to_user())
}

#[tauri::command]
fn render_export(transcript: Transcript, format: String) -> Result<String, String> {
    let fmt = parse_format(&format).ok_or("unknown format")?;
    Ok(utterai_core::export::render(&transcript, fmt))
}

fn parse_format(s: &str) -> Option<ExportFormat> {
    Some(match s {
        "txt" => ExportFormat::Txt,
        "txt_timestamped" => ExportFormat::TxtTimestamped,
        "srt" => ExportFormat::Srt,
        "vtt" => ExportFormat::Vtt,
        "json" => ExportFormat::Json,
        "md" => ExportFormat::Md,
        _ => return None,
    })
}

#[tauri::command]
fn get_history(state: State<AppState>) -> Vec<HistoryEntry> {
    state.store.history()
}

#[tauri::command]
fn save_history(state: State<AppState>, entry: HistoryEntry) -> Result<(), String> {
    state.store.add_history(entry).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_history(state: State<AppState>, id: String) -> Result<(), String> {
    state.store.remove_history(&id).map_err(|e| e.to_string())
}

#[tauri::command]
fn clear_history(state: State<AppState>) -> Result<(), String> {
    state.store.clear_history().map_err(|e| e.to_string())
}

#[tauri::command]
fn clear_cache() -> Result<usize, String> {
    Ok(paths::sweep_temp())
}

// ---------------------------------------------------------------------------
// App entry
// ---------------------------------------------------------------------------

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _ = paths::ensure_dirs();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_process::init())
        .manage(AppState {
            store: Store::load(),
            ..Default::default()
        })
        .setup(|app| {
            init_logging(app.handle());
            if !sidecars::Sidecars::resolve().ready() {
                tracing::warn!("ffmpeg/ffprobe sidecars not found — media handling will fail");
            }
            // Clean up anything a previous crash left behind.
            let removed = paths::sweep_temp();
            if removed > 0 {
                tracing::info!(removed, "swept stale temp files");
            }
            // Make the built-in model available (copy out of the bundle once).
            if let Ok(res_dir) = app.path().resource_dir() {
                let bundled = res_dir
                    .join("resources")
                    .join("models")
                    .join(model::bundled_spec().file);
                match model::install_bundled(&bundled) {
                    Ok(p) => tracing::info!(path = %p.display(), "bundled model ready"),
                    Err(e) => tracing::warn!(error = %e, "bundled model not installed"),
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_settings,
            set_settings,
            dependency_check,
            list_models,
            probe_media,
            download_model,
            cancel_download,
            remove_model,
            verify_model,
            start_transcription,
            cancel_transcription,
            export_transcript,
            render_export,
            get_history,
            save_history,
            delete_history,
            clear_history,
            clear_cache,
        ])
        .run(tauri::generate_context!())
        .expect("error while running UtterAI");
}

fn init_logging(app: &AppHandle) {
    use tracing_subscriber::{fmt, prelude::*, EnvFilter};

    let log_dir = app
        .path()
        .app_log_dir()
        .unwrap_or_else(|_| paths::data_dir().join("logs"));
    let _ = std::fs::create_dir_all(&log_dir);

    let file_appender = tracing_appender::rolling::daily(&log_dir, "utterai.log");
    let filter = EnvFilter::try_from_env("UTTERAI_LOG").unwrap_or_else(|_| EnvFilter::new("info"));

    let _ = tracing_subscriber::registry()
        .with(filter)
        .with(fmt::layer().with_ansi(false).with_writer(file_appender))
        .with(fmt::layer().with_writer(std::io::stderr))
        .try_init();
}
