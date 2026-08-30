# Changelog

All notable changes to UtterAI are recorded here. The format is loosely based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.1] — 2026-08-30

### Fixed

- **Transcription failing with "Generic whisper error … Error code: -6"** on some
  machines. `whisper-rs` 0.16's safe abort-callback wrapper is mistyped, so
  whisper.cpp read an arbitrary byte as its "should I stop?" flag and aborted the
  encode at random — reproducibly on some systems, never on others. UtterAI now
  installs that callback itself with the correct type. A cancelled run is also
  now reported as "cancelled" rather than as a failure.

## [1.1.0] — 2026-08-29

### Added

- **In-app updates.** When a new version ships, UtterAI notices on launch and
  offers to update itself — download, verify, restart. No uninstall/reinstall.
  - Opt-out: a toggle in first-run onboarding and in **Settings → Updates**, plus
    a manual "Check now" button and the current version.
  - The check is a single Ed25519-signed manifest fetch from the GitHub release;
    nothing else is sent, and it can be switched off entirely. See
    [`docs/PRIVACY.md`](docs/PRIVACY.md).
  - Linux: the AppImage updates in place; `.deb` installs keep updating through
    the system package manager. Windows: the NSIS installer updates in place.
- A shared logo mark across the app header, the startup screen and the website,
  drawn from one source shape.
- Community health files: Code of Conduct, security policy, issue/PR templates,
  Dependabot.

### Notes

- Updating from **1.0.0 to 1.1.0 is a one-time manual download** — 1.0.0 predates
  the updater. From 1.1.0 onward it's automatic for anyone who leaves the check
  on.

## [1.0.0] — 2026-08-29 — first public release

A local audio & video transcription app for Windows and Linux. Pick a file,
choose what to transcribe, watch real progress, get a clean transcript, export
it — all on your own machine, with no account and no upload.

### Added

- **Local transcription** via [whisper.cpp](https://github.com/ggerganov/whisper.cpp).
  No API key, no per-minute cost, works offline. A compact **Base** model ships
  in the installer, so the first transcription needs zero setup.
- **Range selection** — drag the handles or type exact in/out points; only the
  selection is processed.
- **Honest progress** — a real percentage from the model, a clear stage for every
  step, a live preview of the text as it arrives. Cancel any time; nothing is
  written, nothing is left behind.
- **Transcript view** — readable paragraphs and a timestamped view,
  click-to-play sync, in-transcript search, inline editing.
- **Exports** — TXT, timestamped TXT, SRT, VTT, Markdown, JSON.
- **Model manager** — resumable, checksum-verified downloads of Small, Medium and
  Large (Turbo).
- **History** of recent transcripts, kept locally. Light/dark, keyboard-navigable,
  first-run onboarding.

### Known limitations

- Binaries are not signed by an OS-recognised authority — SmartScreen / desktop
  warnings on first run are expected. Every artifact has a published SHA-256.
- macOS is not built yet. The engine is a portable Rust crate, so a Mac build is
  planned.
- Very large files work but take proportionally longer; trim to the part you need.

[1.1.1]: https://github.com/thisisankit27/utter-ai/releases/tag/v1.1.1
[1.1.0]: https://github.com/thisisankit27/utter-ai/releases/tag/v1.1.0
[1.0.0]: https://github.com/thisisankit27/utter-ai/releases/tag/v1.0.0
