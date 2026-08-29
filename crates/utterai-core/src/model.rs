//! Whisper model registry, installation and resumable downloads.
//!
//! Models are quantised `ggml` files published by the whisper.cpp project on
//! Hugging Face. We pin an exact SHA-256 for every model so a truncated or
//! tampered download is rejected before it is ever loaded.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};

use futures_util::StreamExt;
use serde::Serialize;
use sha2::{Digest, Sha256};

use crate::error::{CoreError, Result};
use crate::paths;

const HF_BASE: &str = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main";

/// A model UtterAI knows how to obtain and verify.
#[derive(Debug, Clone, Serialize)]
pub struct ModelSpec {
    pub id: &'static str,
    pub display: &'static str,
    pub file: &'static str,
    pub size_bytes: u64,
    pub sha256: &'static str,
    /// One-line "what should I pick?" guidance for the UI.
    pub blurb: &'static str,
    /// Rough speed hint relative to real time on a modern 8-core CPU.
    pub speed_hint: &'static str,
    /// Ships inside the installer — usable with zero setup, fully offline.
    pub bundled: bool,
    /// Hidden from the picker (used only by the test-suite / power users).
    pub internal: bool,
}

impl ModelSpec {
    pub fn url(&self) -> String {
        format!("{HF_BASE}/{}", self.file)
    }
    pub fn installed_path(&self) -> PathBuf {
        paths::model_dir().join(self.file)
    }
}

pub const MODELS: &[ModelSpec] = &[
    ModelSpec {
        id: "tiny",
        display: "Tiny",
        file: "ggml-tiny-q5_1.bin",
        size_bytes: 32_152_673,
        sha256: "818710568da3ca15689e31a743197b520007872ff9576237bda97bd1b469c3d7",
        blurb: "Fastest, roughest. Good for quick drafts of clear speech.",
        speed_hint: "~8× faster than real time",
        bundled: false,
        internal: true,
    },
    ModelSpec {
        id: "base",
        display: "Base",
        file: "ggml-base-q5_1.bin",
        size_bytes: 59_707_625,
        sha256: "422f1ae452ade6f30a004d7e5c6a43195e4433bc370bf23fac9cc591f01a8898",
        blurb: "Built in and ready to go. Solid everyday accuracy, very fast.",
        speed_hint: "~5× faster than real time",
        bundled: true,
        internal: false,
    },
    ModelSpec {
        id: "small",
        display: "Small",
        file: "ggml-small-q5_1.bin",
        size_bytes: 190_085_487,
        sha256: "ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb",
        blurb: "Noticeably better with accents, names and background noise.",
        speed_hint: "~2× faster than real time",
        bundled: false,
        internal: false,
    },
    ModelSpec {
        id: "medium",
        display: "Medium",
        file: "ggml-medium-q5_0.bin",
        size_bytes: 539_212_467,
        sha256: "19fea4b380c3a618ec4723c3eef2eb785ffba0d0538cf43f8f235e7b3b34220f",
        blurb: "High accuracy for tricky audio. Slower and heavier on memory.",
        speed_hint: "about real time",
        bundled: false,
        internal: false,
    },
    ModelSpec {
        id: "large-v3-turbo",
        display: "Large (Turbo)",
        file: "ggml-large-v3-turbo-q5_0.bin",
        size_bytes: 574_041_195,
        sha256: "394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2",
        blurb: "The best accuracy UtterAI offers, tuned to stay reasonably quick.",
        speed_hint: "slightly faster than real time",
        bundled: false,
        internal: false,
    },
];

pub fn find(id: &str) -> Option<&'static ModelSpec> {
    MODELS.iter().find(|m| m.id == id)
}

pub fn bundled_spec() -> &'static ModelSpec {
    MODELS
        .iter()
        .find(|m| m.bundled)
        .expect("a bundled model is defined")
}

/// Models the picker should show, best-default first.
pub fn selectable() -> Vec<&'static ModelSpec> {
    MODELS.iter().filter(|m| !m.internal).collect()
}

#[derive(Debug, Clone, Serialize)]
pub struct InstalledModel {
    pub id: String,
    pub display: String,
    pub path: PathBuf,
    pub size_bytes: u64,
    pub verified: bool,
}

pub fn installed() -> Vec<InstalledModel> {
    MODELS
        .iter()
        .filter_map(|m| {
            let path = m.installed_path();
            let meta = std::fs::metadata(&path).ok()?;
            Some(InstalledModel {
                id: m.id.to_string(),
                display: m.display.to_string(),
                path,
                size_bytes: meta.len(),
                verified: meta.len() == m.size_bytes,
            })
        })
        .collect()
}

pub fn is_installed(id: &str) -> bool {
    find(id)
        .map(|m| {
            std::fs::metadata(m.installed_path())
                .map(|meta| meta.len() == m.size_bytes)
                .unwrap_or(false)
        })
        .unwrap_or(false)
}

/// Copy the model shipped inside the app bundle into the user's model dir,
/// unless a good copy is already there. Cheap to call on every launch.
pub fn install_bundled(bundled_file: &Path) -> Result<PathBuf> {
    let spec = bundled_spec();
    let dest = spec.installed_path();
    if std::fs::metadata(&dest)
        .map(|m| m.len() == spec.size_bytes)
        .unwrap_or(false)
    {
        return Ok(dest);
    }
    std::fs::create_dir_all(paths::model_dir())?;
    if !bundled_file.exists() {
        return Err(CoreError::MissingDependency(format!(
            "bundled model {}",
            spec.file
        )));
    }
    std::fs::copy(bundled_file, &dest)?;
    Ok(dest)
}

#[derive(Debug, Clone, Serialize)]
pub struct DownloadProgress {
    pub received_bytes: u64,
    pub total_bytes: u64,
    pub fraction: f32,
}

/// Download `spec` into the model dir, resuming a previous partial attempt when
/// possible and verifying the SHA-256 before the file is put in place.
pub async fn download(
    spec: &ModelSpec,
    cancel: &AtomicBool,
    on_progress: impl Fn(DownloadProgress),
) -> Result<PathBuf> {
    std::fs::create_dir_all(paths::model_dir())?;
    let final_path = spec.installed_path();
    if std::fs::metadata(&final_path)
        .map(|m| m.len() == spec.size_bytes)
        .unwrap_or(false)
    {
        return Ok(final_path);
    }

    paths::require_space(&paths::model_dir(), spec.size_bytes + 16 * 1_048_576)?;

    let part_path = final_path.with_extension("part");
    let mut existing = std::fs::metadata(&part_path).map(|m| m.len()).unwrap_or(0);
    if existing > spec.size_bytes {
        // A stale/oversized partial — start clean.
        let _ = std::fs::remove_file(&part_path);
        existing = 0;
    }

    let client = reqwest::Client::builder()
        .user_agent("UtterAI")
        .build()
        .map_err(|e| CoreError::Download {
            detail: e.to_string(),
        })?;

    let mut req = client.get(spec.url());
    if existing > 0 {
        req = req.header(reqwest::header::RANGE, format!("bytes={existing}-"));
    }
    let resp = req.send().await.map_err(|e| CoreError::Download {
        detail: e.to_string(),
    })?;

    let resuming = resp.status() == reqwest::StatusCode::PARTIAL_CONTENT;
    if !resp.status().is_success() {
        return Err(CoreError::Download {
            detail: format!("server responded {}", resp.status()),
        });
    }
    if existing > 0 && !resuming {
        // Server ignored our range; restart from zero.
        existing = 0;
        let _ = std::fs::remove_file(&part_path);
    }

    use std::io::Write;
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(resuming && existing > 0)
        .write(true)
        .truncate(!(resuming && existing > 0))
        .open(&part_path)?;

    let total = spec.size_bytes;
    let mut received = existing;
    let mut stream = resp.bytes_stream();
    while let Some(chunk) = stream.next().await {
        if cancel.load(Ordering::Relaxed) {
            return Err(CoreError::Cancelled);
        }
        let chunk = chunk.map_err(|e| CoreError::Download {
            detail: e.to_string(),
        })?;
        file.write_all(&chunk)?;
        received += chunk.len() as u64;
        on_progress(DownloadProgress {
            received_bytes: received,
            total_bytes: total,
            fraction: if total > 0 {
                (received as f32 / total as f32).clamp(0.0, 1.0)
            } else {
                0.0
            },
        });
    }
    file.flush()?;
    drop(file);

    let actual = sha256_file(&part_path)?;
    if actual != spec.sha256 {
        let _ = std::fs::remove_file(&part_path);
        return Err(CoreError::ChecksumMismatch {
            expected: spec.sha256.to_string(),
            actual,
        });
    }

    std::fs::rename(&part_path, &final_path)?;
    Ok(final_path)
}

/// Verify a model already on disk. Used before load and by the Settings screen.
pub fn verify(spec: &ModelSpec) -> Result<()> {
    let path = spec.installed_path();
    if !path.exists() {
        return Err(CoreError::ModelUnavailable(path));
    }
    let actual = sha256_file(&path)?;
    if actual != spec.sha256 {
        return Err(CoreError::ModelCorrupt {
            detail: format!("expected {}, found {actual}", spec.sha256),
        });
    }
    Ok(())
}

pub fn remove(id: &str) -> Result<()> {
    if let Some(spec) = find(id) {
        let path = spec.installed_path();
        if path.exists() {
            std::fs::remove_file(path)?;
        }
    }
    Ok(())
}

fn sha256_file(path: &Path) -> Result<String> {
    let mut file = std::fs::File::open(path)?;
    let mut hasher = Sha256::new();
    std::io::copy(&mut file, &mut hasher)?;
    Ok(hex(&hasher.finalize()))
}

fn hex(bytes: &[u8]) -> String {
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        s.push_str(&format!("{b:02x}"));
    }
    s
}
