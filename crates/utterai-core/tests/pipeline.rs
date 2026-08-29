//! End-to-end pipeline test: real audio → real Whisper → transcript.
//!
//! Needs a ggml model. Point `UTTERAI_TEST_MODEL` at one (CI does this with the
//! quantised tiny model); the test is skipped when it's absent so `cargo test`
//! stays fast and offline for contributors.

use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;

use utterai_core::transcribe::{transcribe, TranscribeEvent, TranscribeRequest};

fn tool(name: &str) -> PathBuf {
    // an explicit sidecar (set by the app build) wins
    if let Ok(dir) = std::env::var("UTTERAI_SIDECAR_DIR") {
        let p = PathBuf::from(dir).join(format!("utterai-{name}"));
        if p.exists() {
            return p;
        }
    }
    // system ffmpeg/ffprobe in CI and dev containers
    for dir in ["/usr/bin", "/usr/local/bin", "/opt/homebrew/bin", "/bin"] {
        let p = PathBuf::from(dir).join(name);
        if p.exists() {
            return p;
        }
    }
    if let Some(paths) = std::env::var_os("PATH") {
        for dir in std::env::split_paths(&paths) {
            let p = dir.join(name);
            if p.is_file() {
                return p;
            }
        }
    }
    PathBuf::from(name)
}

#[test]
fn transcribes_jfk_sample() {
    let Ok(model) = std::env::var("UTTERAI_TEST_MODEL") else {
        eprintln!("skipping: set UTTERAI_TEST_MODEL to a ggml model to run");
        return;
    };
    let model = PathBuf::from(model);
    assert!(
        model.exists(),
        "UTTERAI_TEST_MODEL does not exist: {model:?}"
    );

    let fixture = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../fixtures/jfk.wav")
        .canonicalize()
        .expect("fixture present");

    let req = TranscribeRequest {
        input: fixture,
        range: None,
        model_path: model,
        model_id: "tiny".into(),
        language: Some("en".into()),
        translate: false,
        threads: 2,
    };

    let events = Arc::new(std::sync::Mutex::new(Vec::<String>::new()));
    let ev2 = events.clone();
    let sink: utterai_core::transcribe::EventSink = Arc::new(move |e: TranscribeEvent| {
        if let TranscribeEvent::Stage { stage, .. } = &e {
            ev2.lock().unwrap().push(format!("{stage:?}"));
        }
    });

    let out = transcribe(
        &req,
        &tool("ffmpeg"),
        &tool("ffprobe"),
        Arc::new(AtomicBool::new(false)),
        sink,
    )
    .expect("transcription succeeds");

    let text = out
        .paragraphs
        .iter()
        .map(|p| p.text.to_lowercase())
        .collect::<String>();

    // The JFK line: "...ask not what your country can do for you..."
    assert!(
        text.contains("country") || text.contains("fellow") || text.contains("ask"),
        "unexpected transcript: {text:?}"
    );

    // Timestamps must be ordered and inside the clip.
    let segs = &out.segments;
    assert!(!segs.is_empty());
    for w in segs.windows(2) {
        assert!(w[1].start + 0.001 >= w[0].start, "segments out of order");
    }
    assert!(segs.last().unwrap().end <= 11.5, "timestamp past clip end");

    let stages = events.lock().unwrap().clone();
    assert!(stages.iter().any(|s| s.contains("Extracting")));
    assert!(stages.iter().any(|s| s.contains("Transcribing")));
}

#[test]
fn reports_no_speech_for_silent_audio() {
    let Ok(model) = std::env::var("UTTERAI_TEST_MODEL") else {
        return;
    };
    let fixture =
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../fixtures/generated/silence.wav");
    if !fixture.exists() {
        eprintln!("skipping: run scripts/make-fixtures.sh first");
        return;
    }
    let req = TranscribeRequest {
        input: fixture,
        range: None,
        model_path: PathBuf::from(model),
        model_id: "tiny".into(),
        language: Some("en".into()),
        translate: false,
        threads: 2,
    };
    let result = transcribe(
        &req,
        &tool("ffmpeg"),
        &tool("ffprobe"),
        Arc::new(AtomicBool::new(false)),
        Arc::new(|_| {}),
    );
    match result {
        Err(e) => assert_eq!(e.to_user().code, "no_speech"),
        // Whisper occasionally hallucinates a token on pure silence; tolerate a
        // trivially-short result but never a real sentence.
        Ok(t) => {
            let words: usize = t.segments.iter().map(|s| s.text.split_whitespace().count()).sum();
            assert!(words <= 3, "silence produced {words} words: {:?}", t.segments);
        }
    }
}

#[test]
fn rejects_corrupt_file() {
    let fixture =
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../fixtures/generated/broken.mp3");
    if !fixture.exists() {
        eprintln!("skipping: run scripts/make-fixtures.sh first");
        return;
    }
    let err = utterai_core::media::probe_media(&tool("ffprobe"), &fixture)
        .expect_err("corrupt file should be rejected");
    let user = err.to_user();
    assert!(
        matches!(
            user.code.as_str(),
            "corrupt_media" | "unsupported_media" | "no_audio_track"
        ),
        "got {}",
        user.code
    );
}
