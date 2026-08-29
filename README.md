<div align="center">

# UtterAI

**Private, local audio & video transcription.**

Pick a file → choose what to transcribe → watch real progress → get a clean transcript → export it.
No account. No upload. No API key. Works offline.

[Download](https://utter-ai.vibethroughcode.com) · [Report a bug](https://github.com/thisisankit27/utter-ai/issues)

</div>

---

## What it does

UtterAI turns anything you can hear into text, entirely on your own computer. It's
built for people who transcribe interviews, lectures, podcasts, meetings and voice
memos and would rather their recordings never left the machine.

- **Local by design.** Transcription runs offline via [whisper.cpp](https://github.com/ggerganov/whisper.cpp).
  The only time UtterAI touches the network is when you choose to download a bigger model.
- **Transcribe part or all.** Drag the range handles or type exact in/out points — UtterAI
  only processes the audio you selected.
- **Honest progress.** A real percentage from the model, a live preview of the text as it
  arrives, and a clear stage for every step. Never a frozen window.
- **A real transcript.** Readable paragraphs and a timestamped view, click-to-play sync,
  in-transcript search, inline editing.
- **Sensible exports.** TXT, timestamped TXT, SRT, VTT, Markdown, JSON.
- **Built-in model.** A compact model ships inside the installer, so the first transcription
  works with zero setup. Download Small / Medium / Large (Turbo) anytime for more accuracy.

## Platforms

| Platform | Artifact | Status |
| --- | --- | --- |
| Windows 10/11 | `.exe` (NSIS) / `.msi` | supported |
| Ubuntu / Linux | `.AppImage` / `.deb` | supported |
| Android | — | planned; core is a portable Rust crate ready for a mobile shell |

## Architecture

```
crates/utterai-core   portable Rust engine — ffprobe/ffmpeg, model management,
                      whisper.cpp inference, chunking, exporters (no UI, no Tauri)
src-tauri             Tauri v2 shell — commands, events, bundled sidecars
src                   React + TypeScript + Tailwind front end
site                  Astro landing page → GitHub Pages
```

The transcription pipeline: **probe → extract the selected range to 16 kHz mono →
load model → Whisper (streaming progress) → chunk → export.** Temporary audio is written
`0600` into an app-owned cache and deleted on completion, on cancel, and on next launch.

## Building from source

Prerequisites: Rust (stable), Node 22+, and the system libraries Tauri needs. The
repo ships a container that has all of them:

```bash
git clone https://github.com/thisisankit27/utter-ai
cd utter-ai
npm install
scripts/fetch-binaries.sh                 # ffmpeg/ffprobe sidecars for your platform
curl -fL -o src-tauri/resources/models/ggml-base-q5_1.bin \
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base-q5_1.bin

npm run tauri dev                          # run
npm run tauri build                        # package
```

Or use the container for a reproducible Linux build:

```bash
docker build -f scripts/Dockerfile.build -t utterai-build .
scripts/inbox.sh bash -lc 'npm ci && npm run tauri build'
```

## Testing

```bash
cargo test --workspace                     # engine + exporters + chunking
scripts/make-fixtures.sh                   # generate media fixtures
UTTERAI_TEST_MODEL=/path/to/ggml-tiny.bin cargo test --workspace   # + real pipeline
npm run test:e2e                           # app walkthrough (WebdriverIO + tauri-driver)
```

## Privacy

UtterAI makes exactly two kinds of network request, both user-initiated: downloading a
model, and (on the website only) reading the public download count. It logs no media,
filenames or transcript text at the default level. See [docs/PRIVACY.md](docs/PRIVACY.md).

## License

MIT © Ankit Srivastava
