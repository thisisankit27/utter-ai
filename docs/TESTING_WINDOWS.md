# Testing UtterAI on Windows

This is the setup and checklist for verifying UtterAI on a real Windows 10/11
machine. Linux CI already builds the Windows installers and runs the engine and
UI suites; what a Windows pass adds is **runtime confirmation** — that the
installed app actually renders, transcribes and updates on Windows.

You don't need the repo for the most valuable test (see
[Track A](#track-a-test-the-released-installer-no-toolchain)). The repo is only
needed to run the test suites or build from source.

---

## Track A — test the released installer (no toolchain)

1. Download `UtterAI_<version>_x64-setup.exe` from the
   [latest release](https://github.com/thisisankit27/utter-ai/releases/latest).
2. Verify the hash against `checksums.txt` on the release:

   ```powershell
   Get-FileHash .\UtterAI_*_x64-setup.exe -Algorithm SHA256
   ```

3. Run the installer. Expect a SmartScreen "unrecognised app" prompt →
   **More info → Run anyway** (the binaries aren't signed by an OS authority).
4. Work the [runtime checklist](#runtime-checklist).

Repeat with the `.msi` if you want to check that path too
(`msiexec /i UtterAI_*.msi`).

---

## Track B — run the test suites from source

### Prerequisites

Install (PowerShell, some need an elevated shell):

```powershell
winget install --id OpenJS.NodeJS.LTS         # Node 22+
winget install --id Rustlang.Rustup           # then: rustup default stable-msvc
winget install --id Kitware.CMake
winget install --id LLVM.LLVM                  # provides libclang for whisper-rs-sys
winget install --id Git.Git                    # provides Git Bash for the .sh scripts
```

Also required:

- **MSVC build tools** — "Desktop development with C++" from the Visual Studio
  Build Tools installer (`winget install --id Microsoft.VisualStudio.2022.BuildTools`
  then select that workload). Rust's `stable-msvc` toolchain links against it.
- **WebView2 runtime** — present on current Windows 10/11; if missing,
  `winget install --id Microsoft.EdgeWebView2Runtime`.
- Set `LIBCLANG_PATH` if the build can't find libclang:

  ```powershell
  setx LIBCLANG_PATH "C:\Program Files\LLVM\bin"
  ```

  Open a new shell afterwards.

### Get the code

```powershell
git clone https://github.com/thisisankit27/utter-ai
cd utter-ai
npm ci
```

### 1. Frontend + mock UI (fast, no Rust)

```powershell
npm run typecheck
npm run lint
npm run build
npx playwright install --with-deps chromium
npx playwright test
```

This exercises the entire intake → range → transcribe → transcript → export
flow, the error paths, the update banner and the landing page. It's the same
suite CI runs and it's fully cross-platform.

### 2. Engine tests

```powershell
# Git Bash — fetches the Windows ffmpeg/ffprobe sidecars
bash scripts/fetch-binaries.sh x86_64-pc-windows-msvc

# unit + exporter + chunking tests
cargo test --workspace

# + the real transcription pipeline (needs a model + ffmpeg on PATH)
curl -fL -o "$env:TEMP\ggml-tiny-q5_1.bin" `
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny-q5_1.bin
bash scripts/make-fixtures.sh
$env:UTTERAI_TEST_MODEL = "$env:TEMP\ggml-tiny-q5_1.bin"
cargo test --workspace
```

The first `cargo test` compiles whisper.cpp (~10 min).

### 3. Build the installers

```powershell
curl -fL -o src-tauri/resources/models/ggml-base-q5_1.bin `
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base-q5_1.bin

npm run tauri build -- --bundles nsis,msi
```

Artifacts land in `target\release\bundle\`. Install one and run the
[runtime checklist](#runtime-checklist).

> `tauri build` requires an updater signing key because `tauri.conf.json`
> carries a public key. For a local build you don't need the real one:
> `node_modules\.bin\tauri signer generate --ci -p "" -w "$env:TEMP\dev.key"`,
> then set `TAURI_SIGNING_PRIVATE_KEY` to its contents and
> `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` to an empty string. The signed artifacts
> from a dev key won't be accepted by the real updater — that's fine for a build
> check.

### 4. Packaged-app walkthrough (tauri-driver)

```powershell
cargo install tauri-driver --locked
```

Then install **msedgedriver** whose version matches your Edge / WebView2 runtime
(check `Get-AppxPackage *WebView2*` or Edge's `edge://version`), from
<https://developer.microsoft.com/microsoft-edge/tools/webdriver/>, and put
`msedgedriver.exe` on `PATH` (or set `NATIVE_DRIVER` to its full path).

```powershell
npm run tauri build -- --bundles nsis        # if not already built
$env:UTTERAI_BIN = "$PWD\target\release\utterai.exe"
npm run test:e2e
```

`tests/wdio.conf.ts` picks `msedgedriver` automatically on Windows. The spec
auto-loads `fixtures/jfk.wav`, runs a transcription, and asserts on the
rendered transcript, the timestamped view and the export menu.

---

## What changed in 1.2.0 — verify these first

These are the fixes that had no Windows coverage before release, so they are the
highest-value things to confirm on a real machine.

- [ ] **The play button tells the truth.** On the Review screen press play on an
      MP3, then an M4A and an MP4. Either audio starts *and* the button becomes
      Pause, or it stays Play and a line appears saying the file can't be
      previewed. What must never happen: a Pause icon over silence. (Before
      1.2.0 the button flipped unconditionally, which is why playback looked
      random.)
- [ ] **Disabled controls look disabled.** Settings → pick a model you haven't
      downloaded as the default, go back to Review: "Start transcription" is
      greyed out and says why. Every disabled button used to render identically
      to an enabled one.
- [ ] **Highlights are visible.** During playback the current transcript line has
      a tinted background and a left bar; typing in the search box tints matching
      rows and marks the words. Both were invisible before 1.2.0.
- [ ] **Destructive actions ask first.** Deleting a history entry, "Clear all",
      and removing a model each show a confirmation.
- [ ] **Theme follows the OS.** With Settings → Theme on "System", switch Windows
      between light and dark: the app repaints *and* the sun/moon icon in the
      header changes with it.
- [ ] **Keyboard.** Tab to the range ribbon and use arrow keys (Shift for bigger
      steps, `[` / `]` to switch handle); arrow keys move between segmented
      options; on first run, Tab stays inside the onboarding dialog.
- [ ] **Updating is announced.** With a newer release available, "Update now"
      asks before closing the app, and is refused outright while a transcription
      is running.

> **Expect the old update behaviour when updating *to* 1.2.0.** The improved
> flow ships *in* this version, so an update from 1.1.1 runs 1.1.1's updater and
> the window will still close abruptly on Windows. That is not a regression —
> it is only fixed from 1.2.0 onward.

---

## Runtime checklist

Do this on a freshly installed copy.

- [ ] **Install** — installer runs, app launches, window has the UtterAI icon in
      the title bar and taskbar.
- [ ] **First run** — onboarding shows (4 slides); the "check for updates
      automatically" toggle is on the last slide.
- [ ] **Pick a file** — the OS file picker opens; choose an MP3 or MP4.
- [ ] **Filenames** — try one with spaces and one with non-ASCII characters
      (e.g. `réunion été.m4a`). Both should probe and transcribe.
- [ ] **Range** — drag the handles, type exact in/out points; the "will
      transcribe X" text tracks the selection.
- [ ] **Transcribe** — progress shows a real percentage and a live text
      preview; the window never freezes. Cancel mid-run leaves nothing behind
      (check `%LOCALAPPDATA%\UtterAI\` — no leftover `.wav` in the temp area).
- [ ] **Transcript** — Readable and Timestamped tabs both populate; clicking a
      line seeks the player; search highlights matches; an edit sticks
      (double-click anywhere on a line, or focus it and press F2).
- [ ] **Export** — write an `.srt` and a `.txt`; open them and confirm the
      timing and text.
- [ ] **Formats** — repeat a short transcription for `.wav`, `.m4a`, `.flac`,
      `.mp4`, `.mkv`.
- [ ] **Models** — Settings → download the Small model (progress + resume by
      killing the app mid-download and reopening); cancel a download and confirm
      it reports "Download cancelled" rather than an error dialog; set it as
      default; transcribe with it; remove it while it is the default and check
      the next transcription still works (it should fall back to the built-in
      model, not fail with "model unavailable").
- [ ] **Offline** — disconnect the network, restart, transcribe with the
      built-in model. Works.
- [ ] **Updates** — Settings → Updates → "Check now". With one release published
      it should say "up to date" (the app is the latest). Toggle auto-checks off;
      confirm no network request on next launch (Fiddler / Resource Monitor).
- [ ] **Errors** — feed it a `.txt` renamed to `.mp3`; expect a friendly "this
      file looks damaged" dialog, not a stack trace.
- [ ] **Uninstall** — Apps & features removes it cleanly; `%APPDATA%\UtterAI`
      and `%LOCALAPPDATA%\UtterAI` are what's left (documented in
      [PRIVACY.md](PRIVACY.md)).

## Known Windows notes

- Unsigned binaries → SmartScreen warns on first run. Expected.
- The NSIS installer is per-user (`installMode: currentUser`) — no elevation
  needed.
- Tauri's NSIS bundler has a known upstream quirk where a sidecar can go stale
  across an in-place upgrade; the sidecar filenames are namespaced
  (`utterai-ffmpeg.exe`) and the installer replaces `bin\`. Worth a specific
  check when testing an upgrade from a previous version.
