//! Transcript exporters: TXT, timestamped TXT, SRT, VTT, JSON, Markdown.

use serde::Serialize;

use crate::transcribe::{Segment, Transcript};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ExportFormat {
    Txt,
    TxtTimestamped,
    Srt,
    Vtt,
    Json,
    Md,
}

impl ExportFormat {
    pub fn extension(&self) -> &'static str {
        match self {
            ExportFormat::Txt | ExportFormat::TxtTimestamped => "txt",
            ExportFormat::Srt => "srt",
            ExportFormat::Vtt => "vtt",
            ExportFormat::Json => "json",
            ExportFormat::Md => "md",
        }
    }

    pub fn label(&self) -> &'static str {
        match self {
            ExportFormat::Txt => "Plain text",
            ExportFormat::TxtTimestamped => "Text with timestamps",
            ExportFormat::Srt => "SubRip subtitles (.srt)",
            ExportFormat::Vtt => "WebVTT captions (.vtt)",
            ExportFormat::Json => "JSON",
            ExportFormat::Md => "Markdown",
        }
    }

    pub fn all() -> &'static [ExportFormat] {
        &[
            ExportFormat::Txt,
            ExportFormat::TxtTimestamped,
            ExportFormat::Srt,
            ExportFormat::Vtt,
            ExportFormat::Json,
            ExportFormat::Md,
        ]
    }
}

pub fn render(transcript: &Transcript, format: ExportFormat) -> String {
    match format {
        ExportFormat::Txt => render_txt(transcript),
        ExportFormat::TxtTimestamped => render_txt_timestamped(transcript),
        ExportFormat::Srt => render_srt(&transcript.segments),
        ExportFormat::Vtt => render_vtt(&transcript.segments),
        ExportFormat::Json => render_json(transcript),
        ExportFormat::Md => render_md(transcript),
    }
}

fn render_txt(t: &Transcript) -> String {
    let body = t
        .paragraphs
        .iter()
        .map(|p| p.text.clone())
        .collect::<Vec<_>>()
        .join("\n\n");
    format!("{body}\n")
}

fn render_txt_timestamped(t: &Transcript) -> String {
    let mut s = String::new();
    for seg in &t.segments {
        s.push_str(&format!("[{}] {}\n", clock(seg.start), seg.text));
    }
    s
}

fn render_srt(segments: &[Segment]) -> String {
    let mut s = String::new();
    for (i, seg) in segments.iter().enumerate() {
        s.push_str(&format!(
            "{}\n{} --> {}\n{}\n\n",
            i + 1,
            srt_time(seg.start),
            srt_time(seg.end.max(seg.start + 0.2)),
            seg.text
        ));
    }
    s
}

fn render_vtt(segments: &[Segment]) -> String {
    let mut s = String::from("WEBVTT\n\n");
    for seg in segments {
        s.push_str(&format!(
            "{} --> {}\n{}\n\n",
            vtt_time(seg.start),
            vtt_time(seg.end.max(seg.start + 0.2)),
            seg.text
        ));
    }
    s
}

fn render_md(t: &Transcript) -> String {
    let mut s = format!("# Transcript — {}\n\n", t.source_name);
    s.push_str(&format!(
        "- **Language:** {}\n- **Model:** {}\n- **Span:** {} of audio (from {})\n\n---\n\n",
        t.language,
        t.model_id,
        clock(t.duration),
        clock(t.source_offset),
    ));
    for seg in &t.segments {
        s.push_str(&format!("**[{}]** {}\n\n", clock(seg.start), seg.text));
    }
    s
}

#[derive(Serialize)]
struct JsonOut<'a> {
    source: &'a str,
    language: &'a str,
    model: &'a str,
    duration_seconds: f64,
    source_offset_seconds: f64,
    segments: &'a [Segment],
    paragraphs: &'a [Segment],
}

fn render_json(t: &Transcript) -> String {
    let out = JsonOut {
        source: &t.source_name,
        language: &t.language,
        model: &t.model_id,
        duration_seconds: t.duration,
        source_offset_seconds: t.source_offset,
        segments: &t.segments,
        paragraphs: &t.paragraphs,
    };
    serde_json::to_string_pretty(&out).unwrap_or_else(|_| "{}".into())
}

/// `H:MM:SS` or `MM:SS`, for human-facing views.
pub fn clock(secs: f64) -> String {
    let secs = secs.max(0.0);
    let total = secs.floor() as u64;
    let (h, m, s) = (total / 3600, (total % 3600) / 60, total % 60);
    if h > 0 {
        format!("{h}:{m:02}:{s:02}")
    } else {
        format!("{m:02}:{s:02}")
    }
}

fn srt_time(secs: f64) -> String {
    let (h, m, s, ms) = hms_ms(secs);
    format!("{h:02}:{m:02}:{s:02},{ms:03}")
}

fn vtt_time(secs: f64) -> String {
    let (h, m, s, ms) = hms_ms(secs);
    format!("{h:02}:{m:02}:{s:02}.{ms:03}")
}

fn hms_ms(secs: f64) -> (u64, u64, u64, u64) {
    let secs = secs.max(0.0);
    let ms_total = (secs * 1000.0).round() as u64;
    (
        ms_total / 3_600_000,
        (ms_total % 3_600_000) / 60_000,
        (ms_total % 60_000) / 1000,
        ms_total % 1000,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> Transcript {
        Transcript {
            segments: vec![
                Segment { start: 0.0, end: 2.5, text: "Hello world.".into() },
                Segment { start: 2.5, end: 5.0, text: "This is UtterAI.".into() },
            ],
            paragraphs: vec![Segment {
                start: 0.0,
                end: 5.0,
                text: "Hello world. This is UtterAI.".into(),
            }],
            language: "en".into(),
            model_id: "base".into(),
            duration: 5.0,
            source_offset: 0.0,
            source_name: "demo.mp3".into(),
        }
    }

    #[test]
    fn srt_is_well_formed() {
        let out = render_srt(&sample().segments);
        assert!(out.starts_with("1\n00:00:00,000 --> 00:00:02,500\nHello world.\n\n"));
        assert!(out.contains("2\n00:00:02,500 --> 00:00:05,000\nThis is UtterAI.\n"));
    }

    #[test]
    fn vtt_has_header_and_dot_millis() {
        let out = render_vtt(&sample().segments);
        assert!(out.starts_with("WEBVTT\n\n"));
        assert!(out.contains("00:00:00.000 --> 00:00:02.500"));
    }

    #[test]
    fn timestamps_never_go_backwards_or_zero_length() {
        let segs = vec![Segment { start: 10.0, end: 10.0, text: "tick".into() }];
        let out = render_srt(&segs);
        assert!(out.contains("00:00:10,000 --> 00:00:10,200"));
    }

    #[test]
    fn json_round_trips_key_fields() {
        let out = render_json(&sample());
        let v: serde_json::Value = serde_json::from_str(&out).unwrap();
        assert_eq!(v["language"], "en");
        assert_eq!(v["segments"].as_array().unwrap().len(), 2);
    }

    #[test]
    fn clock_formats() {
        assert_eq!(clock(65.0), "01:05");
        assert_eq!(clock(3661.0), "1:01:01");
    }
}
