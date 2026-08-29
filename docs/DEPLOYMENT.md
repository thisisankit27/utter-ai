# Deployment & operations

## Landing page (GitHub Pages + custom domain)

The site deploys automatically on any push to `master` that touches `site/**`
(`.github/workflows/pages.yml`), and serves from
`https://thisisankit27.github.io/utter-ai/` until the custom domain is live.

### DNS — one record to add

At the DNS provider for **vibethroughcode.com**, add:

| Type | Name | Value | TTL |
| --- | --- | --- | --- |
| `CNAME` | `utter-ai` | `thisisankit27.github.io` | 3600 |

Because it's a subdomain, no apex `A`/`AAAA` records are needed.

Then, in **GitHub → repo Settings → Pages**, set the custom domain to
`utter-ai.vibethroughcode.com` and enable "Enforce HTTPS" once the certificate
is issued (a few minutes to a few hours after DNS propagates). `site/public/CNAME`
already contains the domain, so the Pages deploy keeps it set.

## Releases

Tag `vX.Y.Z` on `master` → `.github/workflows/release.yml` builds Windows
(`.exe`, `.msi`) and Linux (`.AppImage`, `.deb`) via `tauri-apps/tauri-action`,
signs the updater artifacts, and publishes a GitHub Release with the installers,
`checksums.txt` and `latest.json`.

```bash
# 1. bump the version in Cargo.toml, src-tauri/tauri.conf.json, package.json
# 2. add a section to CHANGELOG.md
# 3. commit, then:
git tag -a vX.Y.Z -m "UtterAI vX.Y.Z — <headline>"
git push origin vX.Y.Z
```

`workflow_dispatch` also works with a `tag` input for re-runs. After the release
publishes, flesh out its body from `CHANGELOG.md` if the auto-generated stub
isn't enough.

### Updater signing key (one-time)

In-app updates require a signing keypair. The **public** key lives in
`src-tauri/tauri.conf.json` (`plugins.updater.pubkey`). The **private** key and
its password are repo secrets used only by `release.yml`:

```bash
npx @tauri-apps/cli signer generate -w utterai.key   # prompts for a password
gh secret set TAURI_SIGNING_PRIVATE_KEY          < utterai.key
gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD < password.txt
```

**Back the private key + password up somewhere safe (a password manager).** If
they're lost, a new key means every existing install must be manually
reinstalled to accept updates again — the app rejects packages signed by an
unknown key. Rotating the key = new pubkey in `tauri.conf.json` + a normal
release; users on the old key reinstall once.

Without the secrets the release still builds, but ships no `latest.json`, so
installed apps won't see the update.

## Download counter

`.github/workflows/downloads.yml` runs every 6 hours and whenever a release is
published. It sums `download_count` across every release asset and commits
`site/public/downloads.json`. The landing page prefers that file and falls back
to the live GitHub API; with no releases it shows "Free & open source" rather
than a lonely zero. No manual step is needed as new releases ship.

## Build environment

`scripts/Dockerfile.build` is the reproducible toolchain (Rust 1.98.0 pinned via
`rust-toolchain.toml`, Node 22, GTK/WebKit dev libs, cmake/clang for whisper.cpp,
ffmpeg, xvfb + WebKitWebDriver for E2E). `scripts/inbox.sh` runs a command inside
it as the invoking user with the cargo registry and `target/` in named volumes.

## CI overview

| Workflow | Trigger | Does |
| --- | --- | --- |
| `ci.yml` | PRs, `master` | frontend typecheck/lint/build + Playwright; engine fmt/clippy/tests; full Linux `tauri build` |
| `e2e.yml` | `master`, manual | packaged-app walkthrough via tauri-driver |
| `release.yml` | `v*` tags | multi-platform bundles + checksums |
| `pages.yml` | `site/**` on `master` | deploy landing page |
| `downloads.yml` | schedule, release | refresh the download counter |
