# Changelog

All notable changes to UtterAI are recorded here. The format is loosely based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] — 2026-08-30

A QA pass over playback, the interface's visual state, the updater and the
download experience.

### Fixed

- **Audio preview that sometimes played and sometimes didn't, with no error.**
  Two separate causes. The play button kept its own idea of whether it was
  playing and flipped on click, so when playback failed — an unsupported codec, a
  file that had moved — it showed "Pause" over a silent player. The button now
  follows the player itself and says when a file can't be previewed. Separately,
  the AppImage shipped media codecs and the `.deb` didn't, so the same file
  played from one and not the other; the `.deb` now asks for them, and the
  waveform is no longer blocked from reading the file at all.
- **Interface state that wasn't drawn.** The highlight on the line currently
  playing, the highlight on search matches, the update banner's background and
  the dimming on *every* disabled button were being dropped silently at build
  time. A disabled button was pixel-identical to one you could press.
- The theme icon in the header didn't change when the system switched between
  light and dark.
- Removing the model that was set as the default left every later transcription
  failing with "model unavailable".
- Cancelling a model download reported the cancellation as an error, and cleared
  the progress of any other download in flight.
- Transcription could be started with a model that hadn't been downloaded.
- Double-clicking a transcript line to edit it only worked if the pointer landed
  exactly on the text.
- Correcting a word in an older transcript reset its date to "just now" and moved
  it to the top of History.
- Opening a History entry whose recording had since been moved or deleted gave a
  play button that did nothing; it now says so, and the transcript stays fully
  usable.
- Choosing a different file by dragging it onto the window kept the previous
  file's range selection and playhead.

### Changed

- **Updating now tells you what is about to happen.** On Windows the installer
  takes over and closes UtterAI, which previously looked like the app crashing
  mid-update. It asks first. On every platform, an update can no longer be
  started while a transcription is running — that used to discard the run.
- Deleting a transcript, clearing History and removing a model now ask for
  confirmation.
- Text throughout meets WCAG AA contrast. Timestamps, file sizes, free space and
  form hints were previously below the threshold on every screen.
- The range ribbon, the segmented controls and the transcript list can be driven
  from the keyboard, and first-run is a proper dialog that keeps focus.

### Added

- **A download page** at [utter-ai.vibethroughcode.com](https://utter-ai.vibethroughcode.com):
  it starts the right file for your platform and then explains installing it, the
  first run, and what to do when Windows SmartScreen objects or an AppImage won't
  start. It shows the **SHA-256** of what you downloaded, taken from the release
  build's own checksum file rather than typed in by hand.

### Notes

- The updater improvements land *in* this version, so they apply from 1.2.0
  onwards. Updating 1.1.1 → 1.2.0 still uses 1.1.1's updater.
- On Debian and Ubuntu the new media-codec recommendations apply to a fresh
  `sudo apt install ./UtterAI_*.deb`. An in-place update won't pull them in; if
  audio preview is silent afterwards, `sudo apt install gstreamer1.0-plugins-good
  gstreamer1.0-plugins-bad gstreamer1.0-libav` fixes it. Transcription itself is
  unaffected either way.

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
