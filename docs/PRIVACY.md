# Privacy

UtterAI is built so that your recordings stay on your computer. This document
describes exactly what the application does, so you can verify the claims against
the source.

## What never happens

- **No uploads.** Audio and video files you open are read from disk and processed
  locally. They are never sent anywhere.
- **No account.** There is no sign-in, no user identifier, no licence check.
- **No analytics or telemetry.** UtterAI does not phone home, count launches, or
  report usage or crashes to anyone.
- **No AI API.** Transcription runs locally through
  [whisper.cpp](https://github.com/ggerganov/whisper.cpp). There is no API key and
  nothing is billed per minute.

## The only network requests UtterAI makes

1. **Downloading a transcription model**, and only when you press "Download" in
   Settings. Models come from Hugging Face
   (`huggingface.co/ggerganov/whisper.cpp`). Each download is checked against a
   SHA-256 hash that is compiled into the app.

That's the complete list. The core transcription path (`utterai-core`) makes no
network calls at all — there is a test that asserts this.

The **website** at `utter-ai.vibethroughcode.com` additionally reads the public
download count from the GitHub API. That request comes from your browser when you
visit the page, not from the application.

## Files UtterAI writes

| Location | Contents | Lifetime |
| --- | --- | --- |
| `<data>/UtterAI/models/` | Downloaded model files | Until you remove them in Settings |
| `<data>/UtterAI/tmp/` | Audio extracted from the range you selected, as 16 kHz mono WAV | Deleted when the job finishes, when you cancel, and swept on next launch |
| `<data>/UtterAI/history.json` | Metadata and text of recent transcripts (last 50), so you can reopen them | Until you clear history |
| `<data>/UtterAI/settings.json` | Your preferences | — |
| `<log>/UtterAI/` | Application logs | Rolling daily files |

`<data>` is your platform's app-data directory (e.g. `~/.local/share` on Linux,
`%APPDATA%` on Windows). Temporary audio files are created with `0600` permissions
on Unix so other users on the machine can't read them.

## Logging

At the default level, logs record stages and timings but **not** file paths,
file names, or transcript text. Turning on **Developer mode** in Settings makes
errors show their raw detail in the UI; it does not change what is written to the
log files.

## Removing everything

Uninstall the application, then delete the `UtterAI` folder in your app-data and
app-log directories. Settings → Privacy & storage shows the exact path and can
open it for you.
