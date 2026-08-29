fn main() {
    // Expose the build target triple so we can find dev-mode sidecar binaries
    // named `ffmpeg-<triple>` in `src-tauri/bin/`.
    println!(
        "cargo:rustc-env=TARGET_TRIPLE={}",
        std::env::var("TARGET").unwrap_or_default()
    );
    tauri_build::build()
}
