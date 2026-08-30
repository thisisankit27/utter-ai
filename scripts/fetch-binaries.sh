#!/usr/bin/env bash
# Fetch static ffmpeg + ffprobe and lay them out as Tauri sidecars.
#   src-tauri/bin/utterai-ffmpeg-<target-triple>[.exe]
#   src-tauri/bin/utterai-ffprobe-<target-triple>[.exe]
#
# Binaries are intentionally NOT committed; CI and contributors run this.
#
# Linux: ffbinaries' repackaged John Van Sickle *fully static* builds — no
# shared-library deps, so linuxdeploy just copies them into the AppImage
# (BtbN's builds link VA-API/X11/… and break AppImage packaging). Hosted on
# GitHub, so builds don't depend on johnvansickle.com being reachable.
# Windows: BtbN (no fully-static option there; also GitHub-hosted).
#
# Every download is retried and the archive verified before use.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN="$ROOT/src-tauri/bin"
mkdir -p "$BIN"

TRIPLE="${1:-$(rustc -vV 2>/dev/null | sed -n 's/host: //p')}"
TRIPLE="${TRIPLE:-x86_64-unknown-linux-gnu}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

FFB="https://github.com/ffbinaries/ffbinaries-prebuilt/releases/download/v6.1"
BTBN="https://github.com/BtbN/FFmpeg-Builds/releases/download/latest"

# fetch_zip URL DEST — download (with retries) and verify it's a real zip.
fetch_zip() {
  local url="$1" dest="$2" attempt size
  for attempt in 1 2 3 4; do
    if curl -fL --retry 6 --retry-all-errors --retry-delay 4 \
         --connect-timeout 20 --max-time 900 -o "$dest" "$url"; then
      size=$(wc -c < "$dest" 2>/dev/null || echo 0)
      if [ "$size" -gt 1000000 ] && unzip -tqq "$dest" >/dev/null 2>&1; then
        return 0
      fi
      echo "  $(basename "$url") attempt $attempt: not a valid zip (${size} bytes) — retrying" >&2
    else
      echo "  $(basename "$url") attempt $attempt: download failed — retrying" >&2
    fi
    rm -f "$dest"
    sleep $((attempt * 5))
  done
  return 1
}

# grab NAME URL — fetch a zip that holds a single ffmpeg/ffprobe binary and
# drop it at src-tauri/bin/utterai-NAME-<triple>[.exe].
grab() {
  local name="$1" url="$2"
  local zip="$TMP/$name.zip" dir="$TMP/$name.d" src out
  fetch_zip "$url" "$zip" || { echo "Could not fetch $name from $url" >&2; exit 1; }
  rm -rf "$dir"; mkdir "$dir"
  unzip -qo "$zip" -d "$dir"
  src="$(find "$dir" -type f \( -name "$name" -o -name "$name.exe" \) | head -n1)"
  [ -n "$src" ] || { echo "$name binary not found in $url" >&2; exit 1; }
  out="$BIN/utterai-$name-$TRIPLE"
  case "$src" in *.exe) out="$out.exe" ;; esac
  cp "$src" "$out"
  case "$out" in *.exe) ;; *) chmod +x "$out" ;; esac
}

case "$TRIPLE" in
  x86_64-unknown-linux-gnu)
    echo "Fetching ffmpeg/ffprobe (ffbinaries, static) for $TRIPLE ..."
    grab ffmpeg  "$FFB/ffmpeg-6.1-linux-64.zip"
    grab ffprobe "$FFB/ffprobe-6.1-linux-64.zip"
    ;;
  aarch64-unknown-linux-gnu)
    echo "Fetching ffmpeg/ffprobe (ffbinaries, static) for $TRIPLE ..."
    grab ffmpeg  "$FFB/ffmpeg-6.1-linux-arm-64.zip"
    grab ffprobe "$FFB/ffprobe-6.1-linux-arm-64.zip"
    ;;
  x86_64-pc-windows-msvc | i686-pc-windows-msvc | aarch64-pc-windows-msvc)
    echo "Fetching ffmpeg/ffprobe (BtbN) for $TRIPLE ..."
    zip="$TMP/btbn.zip"
    fetch_zip "$BTBN/ffmpeg-master-latest-win64-gpl.zip" "$zip" \
      || { echo "Could not fetch Windows ffmpeg" >&2; exit 1; }
    unzip -q "$zip" -d "$TMP"
    d="$(find "$TMP" -maxdepth 1 -type d -name 'ffmpeg-*')/bin"
    cp "$d/ffmpeg.exe"  "$BIN/utterai-ffmpeg-$TRIPLE.exe"
    cp "$d/ffprobe.exe" "$BIN/utterai-ffprobe-$TRIPLE.exe"
    ;;
  *)
    echo "No prebuilt ffmpeg mapping for $TRIPLE" >&2
    exit 1
    ;;
esac

echo "Done:"
ls -la "$BIN"
