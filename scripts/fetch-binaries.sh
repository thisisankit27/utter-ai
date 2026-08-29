#!/usr/bin/env bash
# Fetch static ffmpeg + ffprobe and lay them out as Tauri sidecars.
#   src-tauri/bin/utterai-ffmpeg-<target-triple>[.exe]
#   src-tauri/bin/utterai-ffprobe-<target-triple>[.exe]
#
# Binaries are intentionally NOT committed; CI and contributors run this.
#
# Source: BtbN/FFmpeg-Builds GitHub releases for every platform. Served off
# GitHub's CDN, so builds don't depend on a flaky third-party host. The Linux
# builds link only glibc dynamically; everything else is bundled.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN="$ROOT/src-tauri/bin"
mkdir -p "$BIN"

TRIPLE="${1:-$(rustc -vV 2>/dev/null | sed -n 's/host: //p')}"
TRIPLE="${TRIPLE:-x86_64-unknown-linux-gnu}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

BASE="https://github.com/BtbN/FFmpeg-Builds/releases/download/latest"

case "$TRIPLE" in
  x86_64-unknown-linux-gnu)   ASSET="ffmpeg-master-latest-linux64-gpl.tar.xz";     KIND=txz; EXE="" ;;
  aarch64-unknown-linux-gnu)  ASSET="ffmpeg-master-latest-linuxarm64-gpl.tar.xz";  KIND=txz; EXE="" ;;
  x86_64-pc-windows-msvc | i686-pc-windows-msvc | aarch64-pc-windows-msvc)
                              ASSET="ffmpeg-master-latest-win64-gpl.zip";          KIND=zip; EXE=".exe" ;;
  *)
    echo "No prebuilt ffmpeg mapping for $TRIPLE" >&2
    exit 1
    ;;
esac

ARCHIVE="$TMP/ff.$KIND"

echo "Fetching $ASSET for $TRIPLE ..."
ok=0
for attempt in 1 2 3 4; do
  if curl -fL --retry 6 --retry-all-errors --retry-delay 4 \
       --connect-timeout 20 --max-time 900 -o "$ARCHIVE" "$BASE/$ASSET"; then
    size=$(wc -c < "$ARCHIVE")
    if [ "$size" -gt 1000000 ] && {
         { [ "$KIND" = txz ] && tar -tJf "$ARCHIVE" >/dev/null 2>&1; } ||
         { [ "$KIND" = zip ] && unzip -tqq "$ARCHIVE" >/dev/null 2>&1; }
       }; then
      ok=1; break
    fi
    echo "  attempt $attempt: payload not a valid archive (${size:-0} bytes) — retrying" >&2
  else
    echo "  attempt $attempt: download failed — retrying" >&2
  fi
  rm -f "$ARCHIVE"
  sleep $((attempt * 5))
done
[ "$ok" = 1 ] || { echo "Could not fetch a valid $ASSET after 4 attempts" >&2; exit 1; }

if [ "$KIND" = txz ]; then
  tar -xJf "$ARCHIVE" -C "$TMP"
else
  unzip -q "$ARCHIVE" -d "$TMP"
fi

D="$(find "$TMP" -maxdepth 1 -type d -name 'ffmpeg-*')/bin"
[ -f "$D/ffmpeg$EXE" ] || { echo "extracted tree has no bin/ffmpeg$EXE" >&2; exit 1; }

cp "$D/ffmpeg$EXE"  "$BIN/utterai-ffmpeg-$TRIPLE$EXE"
cp "$D/ffprobe$EXE" "$BIN/utterai-ffprobe-$TRIPLE$EXE"
[ -z "$EXE" ] && chmod +x "$BIN/utterai-ffmpeg-$TRIPLE" "$BIN/utterai-ffprobe-$TRIPLE"

echo "Done:"
ls -la "$BIN"
