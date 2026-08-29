# Security Policy

## Supported versions

UtterAI ships fixes in the latest release only. Please make sure you're on the
newest version before reporting (Settings → Updates → **Check now**, or the
[latest release][latest]).

| Version | Supported |
| --- | --- |
| Latest release | ✅ |
| Older | ❌ |

## Reporting a vulnerability

**Please don't open a public issue for security problems.**

Use GitHub's private reporting instead:
[**Report a vulnerability**][advisory] on the Security tab. If you can't use
that, email **thisisankit27@gmail.com** with "UtterAI security" in the subject.

Include what you need to demonstrate the issue — the version, platform, and a
minimal reproduction. Since UtterAI processes media locally, please describe the
triggering file rather than attaching a real recording.

You can expect an acknowledgement within a few days. Once a fix is ready we'll
credit you in the release notes unless you'd rather stay anonymous.

## What's in scope

- The desktop app (`crates/utterai-core`, `src-tauri`, `src`) and its release
  and update pipeline.
- The bundled ffmpeg/ffprobe sidecars *as we invoke them* (argument handling,
  path confinement) — not upstream ffmpeg bugs themselves.

Out of scope: the landing page's dependency on the public GitHub API for the
download counter; unsigned installers (a known, documented limitation — see
below); and findings that require an already-compromised machine.

## How UtterAI is built to be safe

A full self-review — command execution, path handling, temp files, network use,
logging, the updater's signature check — is in
[`docs/SECURITY.md`](docs/SECURITY.md). In short:

- External processes are launched with argument vectors, never shell strings.
- User paths are canonicalised; the model and cache directories are app-owned.
- Extracted audio is written `0600` and deleted on completion, on cancel, and on
  the next launch.
- The transcription path makes **zero** network calls — enforced by a test.
- Auto-update packages are Ed25519-signed; the app refuses any update that
  doesn't verify against the key baked into the build.
- Release binaries are **not** signed by an OS-recognised authority, so
  SmartScreen / Gatekeeper-style warnings on first run are expected. Every
  artifact has a published SHA-256 in `checksums.txt`.

[latest]: https://github.com/thisisankit27/utter-ai/releases/latest
[advisory]: https://github.com/thisisankit27/utter-ai/security/advisories/new
