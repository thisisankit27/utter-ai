//! Tiny JSON-file persistence for settings and transcription history.
//! Kept deliberately simple — no database, no migrations, human-readable.

use std::path::PathBuf;

use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use utterai_core::transcribe::Transcript;

fn data_dir() -> PathBuf {
    utterai_core::paths::data_dir()
}

fn settings_path() -> PathBuf {
    data_dir().join("settings.json")
}

fn history_path() -> PathBuf {
    data_dir().join("history.json")
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Settings {
    /// Model id used when the user doesn't pick one explicitly.
    pub default_model: String,
    pub default_language: String,
    pub default_export_format: String,
    pub theme: String,
    pub developer_mode: bool,
    pub onboarding_complete: bool,
    /// Keep the media player in sync while transcript scrolls.
    pub follow_playback: bool,
    /// Check GitHub for a newer release on launch. Opt-out.
    pub auto_update_check: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            default_model: "base".into(),
            default_language: "auto".into(),
            default_export_format: "txt".into(),
            theme: "system".into(),
            developer_mode: false,
            onboarding_complete: false,
            follow_playback: true,
            auto_update_check: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryEntry {
    pub id: String,
    pub source_path: String,
    pub source_name: String,
    pub created_at: i64,
    pub duration: f64,
    pub range: Option<(f64, f64)>,
    pub model_id: String,
    pub language: String,
    pub transcript: Transcript,
}

#[derive(Default)]
pub struct Store {
    settings: Mutex<Settings>,
    history: Mutex<Vec<HistoryEntry>>,
}

impl Store {
    pub fn load() -> Self {
        let settings = std::fs::read(settings_path())
            .ok()
            .and_then(|b| serde_json::from_slice(&b).ok())
            .unwrap_or_default();
        let history = std::fs::read(history_path())
            .ok()
            .and_then(|b| serde_json::from_slice::<Vec<HistoryEntry>>(&b).ok())
            .unwrap_or_default();
        Self {
            settings: Mutex::new(settings),
            history: Mutex::new(history),
        }
    }

    pub fn settings(&self) -> Settings {
        self.settings.lock().clone()
    }

    pub fn set_settings(&self, next: Settings) -> std::io::Result<()> {
        *self.settings.lock() = next;
        self.persist_settings()
    }

    fn persist_settings(&self) -> std::io::Result<()> {
        std::fs::create_dir_all(data_dir())?;
        let json = serde_json::to_vec_pretty(&*self.settings.lock())?;
        atomic_write(&settings_path(), &json)
    }

    pub fn history(&self) -> Vec<HistoryEntry> {
        self.history.lock().clone()
    }

    pub fn add_history(&self, entry: HistoryEntry) -> std::io::Result<()> {
        {
            let mut h = self.history.lock();
            h.retain(|e| e.id != entry.id);
            h.insert(0, entry);
            h.truncate(50);
        }
        self.persist_history()
    }

    pub fn remove_history(&self, id: &str) -> std::io::Result<()> {
        self.history.lock().retain(|e| e.id != id);
        self.persist_history()
    }

    pub fn clear_history(&self) -> std::io::Result<()> {
        self.history.lock().clear();
        self.persist_history()
    }

    fn persist_history(&self) -> std::io::Result<()> {
        std::fs::create_dir_all(data_dir())?;
        let json = serde_json::to_vec_pretty(&*self.history.lock())?;
        atomic_write(&history_path(), &json)
    }
}

fn atomic_write(path: &std::path::Path, bytes: &[u8]) -> std::io::Result<()> {
    let tmp = path.with_extension("tmp");
    std::fs::write(&tmp, bytes)?;
    std::fs::rename(&tmp, path)
}
