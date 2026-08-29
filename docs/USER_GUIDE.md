# UtterAI — User Guide

UtterAI turns audio and video into text on your own computer. This guide covers
everything you need; it takes about three minutes to read.

## Installing

### Windows

1. Download **UtterAI_x.y.z_x64-setup.exe** from the
   [downloads page](https://utter-ai.vibethroughcode.com/#download).
2. Run it. Windows SmartScreen may warn about a new publisher — choose
   **More info → Run anyway**. (The app is open source and unsigned; every build
   is produced by a public GitHub Actions workflow with published checksums.)
3. UtterAI installs for the current user and opens.

Prefer the `.msi`? It works the same way and is easier to deploy centrally.

### Ubuntu / Linux

**AppImage** — download **UtterAI_x.y.z_amd64.AppImage**, then:

```bash
chmod +x UtterAI_*.AppImage
./UtterAI_*.AppImage
```

**Debian / Ubuntu package**:

```bash
sudo apt install ./UtterAI_*_amd64.deb
```

The `.deb` bundles its own `ffmpeg` under a private name, so it will not touch a
system `ffmpeg` you already have.

## First run

On first launch UtterAI shows three short slides, then it's ready. A compact
**Base** model is built in, so you can transcribe immediately with no download
and no internet connection.

## Transcribing

1. **Choose a file.** Click the drop zone or drag a file onto the window.
   Common audio and video formats work: MP3, WAV, M4A, AAC, FLAC, OGG, Opus,
   MP4, MKV, MOV, WebM and more.
2. **Pick how much to transcribe.** *Whole file*, or *Choose a range* and drag
   the handles / type exact in and out points. The header always tells you how
   much audio will be processed.
3. **Set options if you want.** Model, spoken language (auto-detect by default),
   and an optional "translate to English".
4. **Start.** You'll see the current stage, a real percentage during
   transcription, and a live preview of the text. Press **Cancel** anytime —
   nothing is saved and no files are left behind.

## Working with the transcript

- **Readable** view: flowing paragraphs. **Timestamped** view: caption-sized
  lines with times.
- **Click any line** to play from there (if the source file is still on disk).
  The current line highlights as it plays.
- **Search** the transcript with the box on the right.
- **Edit** a line by double-clicking it. Your edits are kept and are included
  when you export.
- **Copy** puts the current view on the clipboard.
- **Export** writes a file: plain text, text with timestamps, SubRip `.srt`,
  WebVTT `.vtt`, Markdown, or JSON.

## Models

Open **Settings → Transcription models**.

| Model | Size | Speed (8-core CPU) | Use it for |
| --- | --- | --- | --- |
| Base (built in) | ~60 MB | ~5× real time | Clear speech, quick drafts |
| Small | ~180 MB | ~2× real time | Accents, names, some noise |
| Medium | ~515 MB | ~real time | Difficult audio |
| Large (Turbo) | ~550 MB | ~real time | Best accuracy UtterAI offers |

Downloads resume if interrupted and are checked against a known hash. Set any
installed model as the default, or remove ones you don't need.

## Where files live

Settings → **Privacy & storage** shows your data folder and can open it. It
contains your models, your recent transcripts, and settings — nothing else.
"Clear temporary files" removes leftover extracted-audio snippets (safe anytime).

## If something goes wrong

UtterAI explains problems in plain language and suggests what to do next. If you
need the technical detail, turn on **Settings → Advanced → Developer mode** and
the error dialog will show it. Logs are in your app-log directory (the path is in
Settings when developer mode is on).

Common cases:

- **"That file type isn't supported"** — convert to MP3 or MP4 and try again.
- **"This file looks damaged"** — the file is truncated or corrupt; re-export or
  re-download the original.
- **"The transcription model isn't ready"** — open Settings and download a model,
  or switch to the built-in one.
- **Nothing happening on first launch** — UtterAI is copying the built-in model
  into place; it finishes in a second or two.

## Uninstalling

Uninstall the app normally, then delete the `UtterAI` folder shown in Settings →
Privacy & storage (and the matching folder in your app-log directory).
