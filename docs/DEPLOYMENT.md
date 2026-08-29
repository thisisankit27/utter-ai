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
(`.exe`, `.msi`) and Linux (`.AppImage`, `.deb`) via `tauri-apps/tauri-action`
and publishes a GitHub Release with the artifacts and `checksums.txt`.

```bash
# bump versions in Cargo.toml, src-tauri/tauri.conf.json, package.json
git tag v1.0.0
git push origin v1.0.0
```

`workflow_dispatch` also works with a `tag` input for re-runs.

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
