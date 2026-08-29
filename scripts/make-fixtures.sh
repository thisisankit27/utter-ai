#!/usr/bin/env bash
# Generate synthetic media fixtures for the test-suite. Speech is a short TTS-ish
# tone sequence — enough to exercise the pipeline without shipping real audio.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/fixtures/generated"
mkdir -p "$OUT"

# A spoken-word sample would be ideal; for a deterministic, dependency-free
# fixture we synthesise a tone bed. The transcription tests assert the pipeline
# runs and produces ordered timestamps, not specific words.
say() {
  local secs="$1" out="$2"
  ffmpeg -y -loglevel error \
    -f lavfi -i "sine=frequency=180:duration=$secs" \
    -f lavfi -i "sine=frequency=240:duration=$secs" \
    -filter_complex "[0][1]amix=inputs=2,tremolo=f=3:d=0.7,volume=0.6" \
    -ar 16000 -ac 1 "$out"
}

say 3  "$OUT/short-clip.wav"
say 32 "$OUT/base.wav"

ffmpeg -y -loglevel error -i "$OUT/base.wav" -c:a libmp3lame -q:a 5 "$OUT/interview.mp3"
ffmpeg -y -loglevel error -i "$OUT/base.wav" -c:a aac "$OUT/lecture with spaces.m4a"
ffmpeg -y -loglevel error -i "$OUT/base.wav" -c:a flac "$OUT/naïve-café-über.flac"
ffmpeg -y -loglevel error -i "$OUT/base.wav" -c:a libvorbis "$OUT/memo.ogg"
ffmpeg -y -loglevel error -f lavfi -i "color=c=black:s=320x240:d=32" -i "$OUT/base.wav" \
  -shortest -c:v libx264 -pix_fmt yuv420p -c:a aac "$OUT/webinar.mp4"
ffmpeg -y -loglevel error -f lavfi -i "color=c=black:s=320x240:d=32" -i "$OUT/base.wav" \
  -shortest -c:v libx264 -pix_fmt yuv420p -c:a aac "$OUT/screen recording (1).mkv"

# a deliberately corrupt file
head -c 4096 /dev/urandom > "$OUT/broken.mp3"
# a video with no audio track
ffmpeg -y -loglevel error -f lavfi -i "color=c=white:s=160x120:d=4" -c:v libx264 -pix_fmt yuv420p "$OUT/silent.mp4"

echo "fixtures:"
ls -la "$OUT"
