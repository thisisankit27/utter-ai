#!/usr/bin/env bash
# Fetch static ffmpeg + ffprobe and lay them out as Tauri sidecars.
#   src-tauri/bin/ffmpeg-<target-triple>[.exe]
#   src-tauri/bin/ffprobe-<target-triple>[.exe]
#
# Binaries are intentionally NOT committed; CI and contributors run this.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN="$ROOT/src-tauri/bin"
mkdir -p "$BIN"

TRIPLE="${1:-$(rustc -vV 2>/dev/null | sed -n 's/host: //p')}"
TRIPLE="${TRIPLE:-x86_64-unknown-linux-gnu}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "Fetching ffmpeg/ffprobe for $TRIPLE ..."

case "$TRIPLE" in
  x86_64-unknown-linux-gnu)
    URL="https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz"
    curl -fL --retry 3 -o "$TMP/ff.tar.xz" "$URL"
    tar -xJf "$TMP/ff.tar.xz" -C "$TMP"
    D="$(find "$TMP" -maxdepth 1 -type d -name 'ffmpeg-*-static')"
    cp "$D/ffmpeg"  "$BIN/utterai-ffmpeg-$TRIPLE"
    cp "$D/ffprobe" "$BIN/utterai-ffprobe-$TRIPLE"
    chmod +x "$BIN/utterai-ffmpeg-$TRIPLE" "$BIN/utterai-ffprobe-$TRIPLE"
    ;;
  aarch64-unknown-linux-gnu)
    URL="https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-arm64-static.tar.xz"
    curl -fL --retry 3 -o "$TMP/ff.tar.xz" "$URL"
    tar -xJf "$TMP/ff.tar.xz" -C "$TMP"
    D="$(find "$TMP" -maxdepth 1 -type d -name 'ffmpeg-*-static')"
    cp "$D/ffmpeg"  "$BIN/utterai-ffmpeg-$TRIPLE"
    cp "$D/ffprobe" "$BIN/utterai-ffprobe-$TRIPLE"
    chmod +x "$BIN/utterai-ffmpeg-$TRIPLE" "$BIN/utterai-ffprobe-$TRIPLE"
    ;;
  x86_64-pc-windows-msvc | i686-pc-windows-msvc | aarch64-pc-windows-msvc)
    URL="https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip"
    curl -fL --retry 3 -o "$TMP/ff.zip" "$URL"
    unzip -q "$TMP/ff.zip" -d "$TMP"
    D="$(find "$TMP" -maxdepth 1 -type d -name 'ffmpeg-*')"
    cp "$D/bin/ffmpeg.exe"  "$BIN/utterai-ffmpeg-$TRIPLE.exe"
    cp "$D/bin/ffprobe.exe" "$BIN/utterai-ffprobe-$TRIPLE.exe"
    ;;
  *)
    echo "No prebuilt ffmpeg mapping for $TRIPLE" >&2
    exit 1
    ;;
esac

echo "Done:"
ls -la "$BIN"
