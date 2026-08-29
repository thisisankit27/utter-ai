//! Locating the bundled ffmpeg / ffprobe binaries at runtime.
//!
//! They ship as Tauri sidecars named `utterai-ffmpeg` / `utterai-ffprobe`
//! (namespaced so a `.deb` install can't clobber the system `/usr/bin/ffmpeg`).
//!
//! Resolution order:
//!   1. next to our own executable (release layout);
//!   2. `src-tauri/bin/<name>-<target-triple>` (`tauri dev` layout);
//!   3. an un-namespaced `ffmpeg` / `ffprobe` on `PATH` (dev convenience).

use std::path::{Path, PathBuf};

const TRIPLE: &str = env!("TARGET_TRIPLE");

#[derive(Debug, Clone)]
pub struct Sidecars {
    pub ffmpeg: PathBuf,
    pub ffprobe: PathBuf,
}

impl Sidecars {
    pub fn resolve() -> Self {
        Self {
            ffmpeg: locate("utterai-ffmpeg", "ffmpeg"),
            ffprobe: locate("utterai-ffprobe", "ffprobe"),
        }
    }

    pub fn ready(&self) -> bool {
        self.ffmpeg_ok() && self.ffprobe_ok()
    }
    pub fn ffmpeg_ok(&self) -> bool {
        is_runnable(&self.ffmpeg)
    }
    pub fn ffprobe_ok(&self) -> bool {
        is_runnable(&self.ffprobe)
    }
}

fn exe(name: &str) -> String {
    if cfg!(windows) {
        format!("{name}.exe")
    } else {
        name.to_string()
    }
}

fn locate(sidecar: &str, fallback: &str) -> PathBuf {
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(dir) = exe_path.parent() {
            let candidate = dir.join(exe(sidecar));
            if candidate.exists() {
                return candidate;
            }
        }
    }

    let dev = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("bin")
        .join(exe(&format!("{sidecar}-{TRIPLE}")));
    if dev.exists() {
        return dev;
    }

    which(&exe(fallback)).unwrap_or_else(|| PathBuf::from(fallback))
}

fn which(file: &str) -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    std::env::split_paths(&path)
        .map(|p| p.join(file))
        .find(|p| p.is_file())
}

fn is_runnable(path: &Path) -> bool {
    path.is_file() || which(&path.to_string_lossy()).is_some()
}
