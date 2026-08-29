//! Privacy guard: the transcription path must never touch the network.
//!
//! Model downloads are the *only* place `utterai-core` is allowed to make an
//! outbound request, and they live entirely in `model.rs`. This test fails if
//! any other module in the core pipeline gains an HTTP dependency.

use std::fs;
use std::path::Path;

const NETWORK_TOKENS: &[&str] = &[
    "reqwest",
    "hyper::",
    "TcpStream",
    "UdpSocket",
    "ureq",
    "isahc",
    "curl",
    "http://",
    "https://",
];

/// Modules that run while transcribing a user's media.
const PIPELINE_MODULES: &[&str] = &[
    "src/transcribe.rs",
    "src/audio.rs",
    "src/media.rs",
    "src/chunk.rs",
    "src/export.rs",
    "src/paths.rs",
    "src/error.rs",
];

#[test]
fn transcription_modules_have_no_network_code() {
    let base = Path::new(env!("CARGO_MANIFEST_DIR"));
    for module in PIPELINE_MODULES {
        let src = fs::read_to_string(base.join(module))
            .unwrap_or_else(|e| panic!("cannot read {module}: {e}"));
        for line in src.lines() {
            let code = line.split("//").next().unwrap_or("");
            for token in NETWORK_TOKENS {
                assert!(
                    !code.contains(token),
                    "{module} contains network token `{token}` in the transcription path:\n  {line}"
                );
            }
        }
    }
}

#[test]
fn only_model_module_depends_on_http() {
    let base = Path::new(env!("CARGO_MANIFEST_DIR"));
    let mut offenders = Vec::new();
    for entry in fs::read_dir(base.join("src")).unwrap() {
        let path = entry.unwrap().path();
        if path.extension().and_then(|e| e.to_str()) != Some("rs") {
            continue;
        }
        let name = path.file_name().unwrap().to_string_lossy().to_string();
        if name == "model.rs" {
            continue;
        }
        let src = fs::read_to_string(&path).unwrap();
        if src.contains("reqwest") {
            offenders.push(name);
        }
    }
    assert!(
        offenders.is_empty(),
        "only model.rs may use reqwest; found in: {offenders:?}"
    );
}
