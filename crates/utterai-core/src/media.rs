//! Media inspection via `ffprobe`.
//!
//! We only ever invoke ffprobe/ffmpeg with an explicit argument vector — never
//! a shell string — so filenames with spaces, quotes or newlines are safe.

use std::path::Path;
use std::process::Command;

use serde::{Deserialize, Serialize};

use crate::error::{CoreError, Result};

/// What the UI needs to render the "review" screen.
#[derive(Debug, Clone, Serialize)]
pub struct MediaInfo {
    /// Duration in seconds (from the container or the audio stream).
    pub duration_secs: f64,
    pub container: String,
    pub size_bytes: u64,
    pub has_audio: bool,
    pub has_video: bool,
    pub audio_codec: Option<String>,
    pub video_codec: Option<String>,
    pub sample_rate: Option<u32>,
    pub channels: Option<u16>,
    /// A short human label, e.g. "MP3 audio" or "MP4 video".
    pub kind_label: String,
}

pub fn probe_media(ffprobe: &Path, input: &Path) -> Result<MediaInfo> {
    if !input.exists() {
        return Err(CoreError::NotFound(input.to_path_buf()));
    }
    if !ffprobe.exists() {
        return Err(CoreError::MissingDependency("ffprobe".into()));
    }

    let output = Command::new(ffprobe)
        .args([
            "-v",
            "error",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
        ])
        .arg(input)
        .output()
        .map_err(|e| CoreError::MissingDependency(format!("ffprobe ({e})")))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        // ffprobe says "Invalid data found when processing input" for junk files.
        if stderr.contains("Invalid data") || stderr.contains("could not find codec") {
            return Err(CoreError::CorruptMedia { detail: stderr });
        }
        return Err(CoreError::UnsupportedMedia { detail: stderr });
    }

    let probe: FfProbe = serde_json::from_slice(&output.stdout)
        .map_err(|e| CoreError::CorruptMedia { detail: e.to_string() })?;

    let size_bytes = probe
        .format
        .as_ref()
        .and_then(|f| f.size.as_deref())
        .and_then(|s| s.parse().ok())
        .or_else(|| std::fs::metadata(input).ok().map(|m| m.len()))
        .unwrap_or(0);

    let audio = probe.streams.iter().find(|s| s.codec_type.as_deref() == Some("audio"));
    let video = probe.streams.iter().find(|s| s.codec_type.as_deref() == Some("video"));

    // Some video "streams" are just attached cover art — ignore those.
    let real_video = video.filter(|v| v.disposition.as_ref().map(|d| d.attached_pic).unwrap_or(0) == 0);

    let duration_secs = probe
        .format
        .as_ref()
        .and_then(|f| f.duration.as_deref())
        .and_then(|d| d.parse::<f64>().ok())
        .filter(|d| *d > 0.0)
        .or_else(|| {
            audio
                .and_then(|a| a.duration.as_deref())
                .and_then(|d| d.parse::<f64>().ok())
        })
        .unwrap_or(0.0);

    if audio.is_none() {
        return Err(CoreError::NoAudioTrack);
    }
    if duration_secs <= 0.0 {
        return Err(CoreError::CorruptMedia {
            detail: "could not determine a valid duration".into(),
        });
    }

    let container = probe
        .format
        .as_ref()
        .and_then(|f| f.format_name.clone())
        .unwrap_or_default();

    let audio_codec = audio.and_then(|a| a.codec_name.clone());
    let video_codec = real_video.and_then(|v| v.codec_name.clone());
    let has_video = real_video.is_some();

    let kind_label = if has_video {
        format!("{} video", short_container(&container).to_uppercase())
    } else {
        format!("{} audio", short_container(&container).to_uppercase())
    };

    Ok(MediaInfo {
        duration_secs,
        container,
        size_bytes,
        has_audio: true,
        has_video,
        audio_codec,
        video_codec,
        sample_rate: audio
            .and_then(|a| a.sample_rate.as_deref())
            .and_then(|s| s.parse().ok()),
        channels: audio.and_then(|a| a.channels).map(|c| c as u16),
        kind_label,
    })
}

fn short_container(name: &str) -> &str {
    // ffprobe reports comma lists like "mov,mp4,m4a,3gp,3g2,mj2".
    name.split(',').next().unwrap_or(name)
}

#[derive(Deserialize)]
struct FfProbe {
    #[serde(default)]
    streams: Vec<Stream>,
    format: Option<Format>,
}

#[derive(Deserialize)]
struct Stream {
    codec_type: Option<String>,
    codec_name: Option<String>,
    duration: Option<String>,
    sample_rate: Option<String>,
    channels: Option<i64>,
    disposition: Option<Disposition>,
}

#[derive(Deserialize)]
struct Disposition {
    #[serde(default)]
    attached_pic: i64,
}

#[derive(Deserialize)]
struct Format {
    format_name: Option<String>,
    duration: Option<String>,
    size: Option<String>,
}
