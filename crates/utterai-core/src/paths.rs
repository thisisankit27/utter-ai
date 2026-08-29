//! Filesystem locations, safe temp-file handling and disk-space checks.
//!
//! All app-owned data lives under a single per-user directory tree so the app
//! can be fully uninstalled and so we never write next to the user's media.

use std::path::{Path, PathBuf};

use crate::error::{CoreError, Result};

const APP_DIR: &str = "UtterAI";

/// Root for models, caches and history (e.g. `~/.local/share/UtterAI`).
pub fn data_dir() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(std::env::temp_dir)
        .join(APP_DIR)
}

/// Where downloaded / installed Whisper models are stored.
pub fn model_dir() -> PathBuf {
    data_dir().join("models")
}

/// Scratch space for extracted audio. Everything here is disposable.
pub fn temp_dir() -> PathBuf {
    data_dir().join("tmp")
}

/// Ensure the standard directory tree exists.
pub fn ensure_dirs() -> Result<()> {
    for d in [data_dir(), model_dir(), temp_dir()] {
        std::fs::create_dir_all(&d)?;
    }
    Ok(())
}

/// Remove stray temp files left behind by a previous crash or force-quit.
/// Returns the number of files removed.
pub fn sweep_temp() -> usize {
    let mut removed = 0;
    if let Ok(entries) = std::fs::read_dir(temp_dir()) {
        for entry in entries.flatten() {
            if std::fs::remove_file(entry.path()).is_ok() {
                removed += 1;
            } else if std::fs::remove_dir_all(entry.path()).is_ok() {
                removed += 1;
            }
        }
    }
    removed
}

/// A uniquely-named scratch file that deletes itself on drop.
///
/// Created with `0600` permissions on Unix so other users can't read the
/// audio we extract from someone's private media.
pub struct ScratchFile {
    path: PathBuf,
}

impl ScratchFile {
    pub fn new(extension: &str) -> Result<Self> {
        std::fs::create_dir_all(temp_dir())?;
        let name = format!(
            "utterai-{}-{}.{}",
            std::process::id(),
            fastrand_hex(),
            extension.trim_start_matches('.')
        );
        let path = temp_dir().join(name);
        // Touch the file with tight permissions.
        let file = std::fs::OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&path)?;
        harden_permissions(&file)?;
        drop(file);
        Ok(Self { path })
    }

    pub fn path(&self) -> &Path {
        &self.path
    }
}

impl Drop for ScratchFile {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.path);
    }
}

#[cfg(unix)]
fn harden_permissions(file: &std::fs::File) -> Result<()> {
    use std::os::unix::fs::PermissionsExt;
    let mut perms = file.metadata()?.permissions();
    perms.set_mode(0o600);
    file.set_permissions(perms)?;
    Ok(())
}

#[cfg(not(unix))]
fn harden_permissions(_file: &std::fs::File) -> Result<()> {
    Ok(())
}

fn fastrand_hex() -> String {
    // Small, dependency-free randomness for temp names — not security sensitive.
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let mix = nanos ^ (nanos >> 17) ^ ((std::process::id() as u128) << 40);
    format!("{mix:032x}")
}

/// Available free space, in bytes, on the volume containing `path`
/// (or its nearest existing ancestor).
pub fn available_space(path: &Path) -> Option<u64> {
    let mut probe = path.to_path_buf();
    while !probe.exists() {
        probe = probe.parent()?.to_path_buf();
    }
    fs4::available_space(&probe).ok()
}

/// Fail early if a step needs more space than is available.
pub fn require_space(path: &Path, needed_bytes: u64) -> Result<()> {
    if let Some(avail) = available_space(path) {
        if avail < needed_bytes {
            return Err(CoreError::LowDiskSpace {
                needed_mb: needed_bytes / 1_048_576,
                available_mb: avail / 1_048_576,
            });
        }
    }
    Ok(())
}

/// Reject paths that don't point at a real, regular file.
pub fn validate_input_file(path: &Path) -> Result<PathBuf> {
    let canonical = path
        .canonicalize()
        .map_err(|_| CoreError::NotFound(path.to_path_buf()))?;
    let meta = std::fs::metadata(&canonical).map_err(|_| CoreError::NotFound(canonical.clone()))?;
    if !meta.is_file() {
        return Err(CoreError::UnsupportedMedia {
            detail: "path is not a regular file".into(),
        });
    }
    Ok(canonical)
}
