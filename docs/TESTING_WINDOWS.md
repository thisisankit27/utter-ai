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
      line seeks the player; search highlights matches; an edit sticks.
- [ ] **Export** — write an `.srt` and a `.txt`; open them and confirm the
      timing and text.
- [ ] **Formats** — repeat a short transcription for `.wav`, `.m4a`, `.flac`,
      `.mp4`, `.mkv`.
- [ ] **Models** — Settings → download the Small model (progress + resume by
      killing the app mid-download and reopening); set it as default; transcribe
      with it; remove it.
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
