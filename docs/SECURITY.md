# Security & privacy review

This is a self-review of the areas that matter for an app people feed personal
recordings into. It is kept in the repo so the claims can be checked against the
code.

## Threat model

UtterAI is a local desktop app. It has no server component and no auth. The
things worth protecting:

1. The user's media and transcripts stay on their machine.
2. A malicious or malformed media file can't get code execution or escape the
   working directory.
3. Other local users can't read audio UtterAI extracts.

## Command execution

`ffmpeg` and `ffprobe` are invoked **only** through `std::process::Command` with
an explicit argument vector — never a shell, never string interpolation. A file
named `"; rm -rf ~ #.mp3` is passed as a single `OsStr` argument.

- `crates/utterai-core/src/media.rs` — `Command::new(ffprobe).args([...]).arg(input)`
- `crates/utterai-core/src/audio.rs` — same pattern; `-progress pipe:1` is read
  from the child's stdout, not a shell pipe.
- The child's `stdin` is `Stdio::null()` and `-nostdin` is passed, so ffmpeg
  can't block waiting for console input on a malformed file.

The sidecar binaries are resolved from (1) next to our own executable,
(2) the dev `bin/` folder, (3) `PATH`. On Linux the bundled binaries are named
`utterai-ffmpeg` / `utterai-ffprobe` so a `.deb` install can't overwrite a
system `/usr/bin/ffmpeg`.

## Path handling

- Input paths are `canonicalize()`d and checked to be a regular file
  (`paths::validate_input_file`).
- All app-written files go under one per-user directory tree
  (`paths::data_dir()`); nothing is written next to the user's media.
- Exports are written only to a path the user picked in the OS save dialog.
- The Tauri asset protocol is scoped in `tauri.conf.json`; it is used to let the
  webview's `<video>`/`<audio>` element play the file the user opened.

## Temporary files

- Extracted audio is written to `data_dir()/tmp/` with a process-id +
  time-mixed name.
- On Unix the file is created and immediately `chmod`ed to `0600`
  (`paths::harden_permissions`).
- `ScratchFile` deletes itself on `Drop`, including on error and cancellation.
- On every launch `paths::sweep_temp()` removes anything left in `tmp/` by a
  previous crash or force-quit.

## Network

- `utterai-core` makes outbound requests **only** in `model.rs` (model
  downloads over HTTPS from Hugging Face, each verified against a compiled-in
  SHA-256). Two tests enforce this:
  `tests/no_network_in_core_path.rs`.
- The transcription pipeline (`transcribe`, `audio`, `media`, `chunk`,
  `export`) has no HTTP dependency.
- The desktop shell adds no network use of its own.
- CSP in `tauri.conf.json` restricts the webview to `'self'` + the asset
  protocol; `connect-src` is `'self' ipc:` only.

## Logging

- Default log level records stage names and timings. It does **not** log file
  paths, file names, or transcript text.
- `tracing` writes rolling daily files to the app-log dir. Developer mode
  changes what the UI *shows*, not what is written.

## Dependencies

- Rust: `whisper-rs` (bundled whisper.cpp), `reqwest` with `rustls` (no OpenSSL
  linkage), `hound`, `sha2`, `serde`, `tokio`. `cargo clippy -D warnings` in CI.
- The bundled `ffmpeg`/`ffprobe` are the standard static builds
  (John Van Sickle on Linux, BtbN on Windows), fetched by
  `scripts/fetch-binaries.sh` at build time and not committed.

## Known limitations

- Release binaries are **unsigned**. Windows SmartScreen and Linux desktops will
  warn on first run. Builds are reproducible from a public workflow and every
  artifact has a published checksum (`checksums.txt` on each release).
- The Tauri NSIS installer has a known upstream issue where a sidecar can go
  stale across an in-place upgrade; the sidecar filename carries no version, and
  the installer replaces `bin/` contents — verified in the release smoke test.

## Reporting

Open a GitHub issue, or for anything sensitive, mark it clearly and a maintainer
will follow up privately.
