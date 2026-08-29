//! Range extraction and audio normalisation via `ffmpeg`.
//!
//! We extract only the user-selected slice of the media and down-mix it to the
//! 16 kHz mono PCM that Whisper expects. Nothing more of the file is touched.

use std::io::{BufRead, BufReader};
use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};

use crate::error::{CoreError, Result};

pub const WHISPER_SAMPLE_RATE: u32 = 16_000;

/// Progress of the extraction step, `0.0..=1.0`, or `None` when ffmpeg can't
/// tell us how far along it is (rare, very short inputs).
pub type ExtractProgress<'a> = dyn Fn(Option<f32>) + Send + Sync + 'a;

/// Extract `[start, end)` seconds of `input` into a 16 kHz mono WAV at `out`.
///
/// `start`/`end` are clamped to the real media duration by the caller. This
/// function trusts them but still guards against a non-positive span.
pub fn extract_range(
    ffmpeg: &Path,
    input: &Path,
    out: &Path,
    start_secs: f64,
    end_secs: f64,
    cancel: &AtomicBool,
    on_progress: &ExtractProgress<'_>,
) -> Result<()> {
    if !ffmpeg.exists() {
        return Err(CoreError::MissingDependency("ffmpeg".into()));
    }
    let span = end_secs - start_secs;
    if span <= 0.0 {
        return Err(CoreError::InvalidRange {
            start: start_secs,
            end: end_secs,
            duration: 0.0,
        });
    }

    // Input seeking (`-ss` before `-i`) is fast and accurate enough for speech.
    let mut child = Command::new(ffmpeg)
        .args(["-hide_banner", "-nostdin", "-y"])
        .arg("-ss")
        .arg(format!("{start_secs:.3}"))
        .arg("-i")
        .arg(input)
        .arg("-t")
        .arg(format!("{span:.3}"))
        .args([
            "-vn", // drop video
            "-sn", // drop subtitles
            "-dn", // drop data streams
            "-ac", "1",
            "-ar", &WHISPER_SAMPLE_RATE.to_string(),
            "-c:a", "pcm_s16le",
            "-f", "wav",
        ])
        .arg(out)
        .args(["-progress", "pipe:1", "-nostats", "-loglevel", "error"])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| CoreError::MissingDependency(format!("ffmpeg ({e})")))?;

    let stdout = child.stdout.take().expect("piped stdout");
    let reader = BufReader::new(stdout);

    for line in reader.lines() {
        if cancel.load(Ordering::Relaxed) {
            let _ = child.kill();
            let _ = child.wait();
            return Err(CoreError::Cancelled);
        }
        let Ok(line) = line else { break };
        if let Some(us) = line.strip_prefix("out_time_us=") {
            if let Ok(us) = us.trim().parse::<i64>() {
                let done = (us as f64 / 1_000_000.0) / span;
                on_progress(Some(done.clamp(0.0, 1.0) as f32));
            }
        } else if line == "progress=end" {
            on_progress(Some(1.0));
        }
    }

    let status = child.wait()?;
    if !status.success() {
        let mut stderr = String::new();
        if let Some(mut e) = child.stderr.take() {
            use std::io::Read;
            let _ = e.read_to_string(&mut stderr);
        }
        if cancel.load(Ordering::Relaxed) {
            return Err(CoreError::Cancelled);
        }
        return Err(CoreError::Ffmpeg {
            code: status.code(),
            stderr: stderr.trim().to_string(),
        });
    }

    // A near-empty WAV means the range produced no audio.
    let produced = std::fs::metadata(out).map(|m| m.len()).unwrap_or(0);
    if produced < 128 {
        return Err(CoreError::Ffmpeg {
            code: status.code(),
            stderr: "no audio was produced for the selected range".into(),
        });
    }
    Ok(())
}

/// Read a 16-bit / 32-bit-float PCM WAV into mono `f32` samples in `-1.0..=1.0`.
///
/// The file we feed here is one we just wrote with ffmpeg, so it is always
/// 16 kHz mono `pcm_s16le`; the extra branches are defensive.
pub fn read_wav_mono_f32(path: &Path) -> Result<Vec<f32>> {
    let mut reader = hound::WavReader::open(path)
        .map_err(|e| CoreError::CorruptMedia { detail: e.to_string() })?;
    let spec = reader.spec();

    let raw: Vec<f32> = match spec.sample_format {
        hound::SampleFormat::Int => {
            let max = (1i64 << (spec.bits_per_sample - 1)) as f32;
            reader
                .samples::<i32>()
                .map(|s| s.map(|v| v as f32 / max))
                .collect::<std::result::Result<_, _>>()
                .map_err(|e| CoreError::CorruptMedia { detail: e.to_string() })?
        }
        hound::SampleFormat::Float => reader
            .samples::<f32>()
            .collect::<std::result::Result<_, _>>()
            .map_err(|e| CoreError::CorruptMedia { detail: e.to_string() })?,
    };

    let mono = if spec.channels <= 1 {
        raw
    } else {
        let ch = spec.channels as usize;
        raw.chunks(ch)
            .map(|frame| frame.iter().sum::<f32>() / ch as f32)
            .collect()
    };

    if spec.sample_rate != WHISPER_SAMPLE_RATE {
        return Ok(resample_linear(&mono, spec.sample_rate, WHISPER_SAMPLE_RATE));
    }
    Ok(mono)
}

/// Minimal linear resampler — only a safety net; ffmpeg already gives us 16 kHz.
fn resample_linear(input: &[f32], from: u32, to: u32) -> Vec<f32> {
    if from == to || input.is_empty() {
        return input.to_vec();
    }
    let ratio = to as f64 / from as f64;
    let out_len = (input.len() as f64 * ratio).round() as usize;
    let mut out = Vec::with_capacity(out_len);
    for i in 0..out_len {
        let src = i as f64 / ratio;
        let idx = src.floor() as usize;
        let frac = (src - idx as f64) as f32;
        let a = input.get(idx).copied().unwrap_or(0.0);
        let b = input.get(idx + 1).copied().unwrap_or(a);
        out.push(a + (b - a) * frac);
    }
    out
}
