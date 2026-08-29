# Contributing to UtterAI

Thanks for taking a look. UtterAI is a small, focused desktop app; contributions
that keep it that way are very welcome.

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md). For
security issues, **don't** open a public issue — see [SECURITY.md](SECURITY.md).

## Filing an issue

Use the [bug report or feature request templates][new-issue]. For bugs, include
your UtterAI version, OS, and a description of the media (length, format,
language) — please don't attach real recordings.

[new-issue]: https://github.com/thisisankit27/utter-ai/issues/new/choose

## Repository layout

| Path | What it is |
| --- | --- |
| `crates/utterai-core` | The portable transcription engine. No Tauri, no UI. This is where the real logic lives. |
| `src-tauri` | The Tauri v2 desktop shell — commands, events, sidecar wiring. Thin. |
| `src` | React + TypeScript + Tailwind front end. |
| `site` | The static landing page deployed to GitHub Pages. |
| `scripts` | Build container, sidecar fetch, icon + fixture generation. |
| `tests` | Playwright (mock app + landing page) and a WebdriverIO + tauri-driver walkthrough of the packaged binary. |

## Prerequisites

- **Rust** stable, **Node 22+**.
- Native build tools: `cmake`, `clang`/`libclang` (for whisper.cpp), and the
  GTK/WebKit `-dev` packages Tauri needs on Linux. See
  [`scripts/Dockerfile.build`](scripts/Dockerfile.build) for the exact list.
- `ffmpeg` on `PATH` is enough for `cargo test`; `scripts/fetch-binaries.sh`
  fetches the sidecar builds the app bundles.

If you'd rather not install all of that:

```bash
docker build -f scripts/Dockerfile.build -t utterai-build .
scripts/inbox.sh cargo test --workspace
scripts/inbox.sh bash -lc 'npm ci && npm run tauri build'
```

## Running

```bash
npm install
scripts/fetch-binaries.sh
curl -fL -o src-tauri/resources/models/ggml-base-q5_1.bin \
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base-q5_1.bin
npm run tauri dev
```

## Before you open a PR

```bash
cargo fmt --all
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
npm run typecheck && npm run lint && npm run build
npx playwright test
```

- Keep engine logic in `utterai-core` with unit tests. The Tauri layer should
  mostly translate between commands/events and core calls.
- External processes are invoked with argument vectors only — never a shell
  string.
- User-facing errors go through `CoreError::to_user()`; don't surface raw
  strings in the UI.
- One focused change per PR. CI (`fmt`, `clippy`, `test`, frontend build, a Linux
  `tauri build`) must be green.

## Commits

Conventional-ish prefixes (`feat:`, `fix:`, `chore:`, `docs:`, `test:`). Small,
reviewable commits with real messages.
