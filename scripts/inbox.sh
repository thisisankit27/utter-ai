#!/usr/bin/env bash
# Run a command inside the UtterAI build container as the current user, with
# cargo registry + target dirs persisted in named volumes.
#
#   scripts/inbox.sh cargo test --workspace
#   scripts/inbox.sh bash -lc 'npm ci && npm run tauri build'
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

docker volume create utterai-cargo >/dev/null
docker volume create utterai-target >/dev/null

# Make the volumes writable by the invoking user (first run only, cheap after).
docker run --rm -v utterai-cargo:/c -v utterai-target:/t alpine \
  sh -c "chown -R $(id -u):$(id -g) /c /t" >/dev/null 2>&1 || true

exec docker run --rm -t \
  -u "$(id -u):$(id -g)" \
  -e CARGO_HOME=/cargo \
  -e HOME=/tmp \
  -e PATH=/usr/local/cargo/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
  -v "$ROOT":/work \
  -v utterai-cargo:/cargo \
  -v utterai-target:/work/target \
  -w /work \
  utterai-build:latest "$@"
