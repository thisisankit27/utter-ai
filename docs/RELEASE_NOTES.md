# Release notes

## v1.0.0 — first public release

UtterAI is a local audio & video transcription app for Windows and Linux.
Pick a file, choose what to transcribe, watch real progress, get a clean
transcript, export it — all on your own machine, with no account and no upload.

### Highlights

- **Local transcription** via whisper.cpp. No API key, no per-minute cost, works
  offline. A compact **Base** model ships in the installer, so the first
  transcription needs zero setup.
- **Transcribe part or all** of a file. Drag the range handles or type exact in
  and out points; UtterAI only processes what you selected.
- **Honest progress.** A real percentage from the model during transcription, a
  clear stage for every step, and a live preview of the text as it arrives.
  Cancel at any time — nothing is written, nothing is left behind.
- **A usable transcript.** Readable paragraphs and a timestamped view,
  click-to-play sync, in-transcript search, inline editing.
- **Exports:** TXT, timestamped TXT, SRT, VTT, Markdown, JSON.
- **Model manager** with resumable, checksum-verified downloads of Small,
  Medium and Large (Turbo).
- **History** of recent transcripts, kept locally.
- Light / dark, keyboard-navigable, first-run onboarding.

### Downloads

| Platform | File |
| --- | --- |
| Windows 10/11 | `.exe` (NSIS) and `.msi` |
| Ubuntu / Debian | `.deb` |
| Other Linux | `.AppImage` |

Every artifact is built by the `Release` GitHub Actions workflow; `checksums.txt`
is attached to the release.

### Known limitations

- Binaries are **unsigned** — Windows SmartScreen and some Linux desktops warn on
  first run.
- **macOS is not built yet.** The transcription engine is a portable Rust crate,
  so a Mac build is planned.
- Very large files work but take proportionally longer; trim to the part you need.

### For developers

- `crates/utterai-core` — the portable engine (probe, extract, whisper, chunk,
  export), fully unit- and integration-tested.
- `src-tauri` — thin Tauri v2 shell.
- `src` — React + TypeScript UI, runnable in a browser against a mock backend.
- See `CONTRIBUTING.md` and `docs/SECURITY.md`.
