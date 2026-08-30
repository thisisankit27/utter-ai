/**
 * One reliable media-player hook, shared by the Review and Transcript screens.
 *
 * The screens used to keep their own `playing` boolean and flip it optimistically
 * on click. That lies whenever playback doesn't actually start — an unsupported
 * codec, a file that moved, a `play()` the webview rejects — leaving a Pause
 * button on a silent player. Here the element is the single source of truth:
 * `playing` only ever comes from the element's own `play` / `pause` / `ended`
 * events, and a failure is surfaced instead of swallowed.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export type MediaError =
  | { kind: "unsupported"; message: string }
  | { kind: "missing"; message: string }
  | { kind: "blocked"; message: string };

export interface MediaPlayer {
  /** Attach to the `<video>` element that `renderMediaElement` creates. */
  ref: React.RefObject<HTMLVideoElement>;
  /** True only while the element reports it is actually playing. */
  playing: boolean;
  /** Current playhead, in seconds, within the source file. */
  currentTime: number;
  /** True once the element has enough metadata to seek and play. */
  ready: boolean;
  /** Set when playback is impossible; `playing` stays false. */
  error: MediaError | null;
  toggle: () => void;
  pause: () => void;
  seek: (secs: number) => void;
}

const UNSUPPORTED_MESSAGE =
  "This file's audio can't be previewed here, but it can still be transcribed.";

/**
 * @param src  Asset URL for the media, or `null` when there is nothing to play.
 */
export function useMediaPlayer(src: string | null): MediaPlayer {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<MediaError | null>(null);

  /** A seek requested before the element could honour it. */
  const pendingSeek = useRef<number | null>(null);

  // Every `src` change starts a new lifecycle: drop the state belonging to the
  // previous file so a stale "playing"/"12:04" never leaks onto the next one.
  useEffect(() => {
    setPlaying(false);
    setCurrentTime(0);
    setReady(false);
    setError(src ? null : { kind: "missing", message: "No media file to play." });
    pendingSeek.current = null;
  }, [src]);

  // Bind to the element's own events. These fire for *every* transition,
  // including ones we didn't initiate (end of file, decode failure, the webview
  // pausing us), which is exactly why they — not our click handler — own state.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => setPlaying(false);
    const onTime = () => setCurrentTime(el.currentTime);
    const onLoaded = () => {
      setReady(true);
      setError(null);
      if (pendingSeek.current != null) {
        applySeek(el, pendingSeek.current);
        pendingSeek.current = null;
      }
    };
    const onError = () => {
      setPlaying(false);
      setReady(false);
      setError({ kind: "unsupported", message: UNSUPPORTED_MESSAGE });
    };

    el.addEventListener("play", onPlay);
    el.addEventListener("playing", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("ended", onEnded);
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("loadedmetadata", onLoaded);
    el.addEventListener("error", onError);
    return () => {
      el.removeEventListener("play", onPlay);
      el.removeEventListener("playing", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("ended", onEnded);
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("loadedmetadata", onLoaded);
      el.removeEventListener("error", onError);
    };
  }, [src]);

  // Stop playback when the screen goes away; an orphaned element keeps decoding.
  useEffect(() => {
    const el = ref.current;
    return () => {
      if (el && !el.paused) el.pause();
    };
  }, []);

  const seek = useCallback((secs: number) => {
    const el = ref.current;
    if (!el) return;
    const target = Math.max(0, secs);
    // `currentTime` is a no-op (or throws) before metadata lands. Remember it
    // and apply it on `loadedmetadata` so click-to-play never silently misses.
    if (el.readyState < 1) {
      pendingSeek.current = target;
      setCurrentTime(target);
      return;
    }
    applySeek(el, target);
    setCurrentTime(el.currentTime);
  }, []);

  const pause = useCallback(() => {
    const el = ref.current;
    if (el && !el.paused) el.pause();
  }, []);

  const toggle = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    if (!el.paused) {
      el.pause();
      return;
    }
    // `play()` is a promise. If it rejects the media never started, so the
    // button must not flip — report why instead.
    const started = el.play();
    if (started && typeof started.catch === "function") {
      started.catch((e: unknown) => {
        setPlaying(false);
        const name = e instanceof Error ? e.name : "";
        setError(
          name === "NotAllowedError"
            ? { kind: "blocked", message: "Playback was blocked by the system." }
            : { kind: "unsupported", message: UNSUPPORTED_MESSAGE },
        );
      });
    }
  }, []);

  return { ref, playing, currentTime, ready, error, toggle, pause, seek };
}

function applySeek(el: HTMLVideoElement, secs: number) {
  const max = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : undefined;
  el.currentTime = max != null ? Math.min(secs, max) : secs;
}
