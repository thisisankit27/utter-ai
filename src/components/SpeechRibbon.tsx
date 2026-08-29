import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { clock } from "@/lib/format";

/**
 * The speech ribbon — one object that recurs through the whole flow:
 *  - "select": pick a start/end range with draggable handles
 *  - "progress": fills with iris as transcription proceeds
 *  - "play": a scrubber synced to the media player + active line
 */
export type RibbonMode = "select" | "progress" | "play";

interface Props {
  duration: number;
  peaks?: number[] | null;
  mode: RibbonMode;
  /** [start, end] in seconds; for "select" this is the working range. */
  range?: [number, number] | null;
  onRangeChange?: (range: [number, number]) => void;
  /** 0..1 — only for "progress". */
  progress?: number;
  /** seconds — playhead for "play". */
  currentTime?: number;
  onSeek?: (secs: number) => void;
  /** highlight window (e.g. the active transcript line) for "play". */
  highlight?: [number, number] | null;
  height?: number;
}

const HANDLE_HIT = 12;

export function SpeechRibbon({
  duration,
  peaks,
  mode,
  range,
  onRangeChange,
  progress = 0,
  currentTime = 0,
  onSeek,
  highlight,
  height = 96,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);
  const [drag, setDrag] = useState<null | "start" | "end" | "seek">(null);
  const [hoverX, setHoverX] = useState<number | null>(null);

  const bars = useMemo(() => {
    const n = Math.max(24, Math.floor(width / 6));
    if (peaks && peaks.length) {
      // resample the provided peaks to n bars
      const out = new Array(n);
      for (let i = 0; i < n; i++) {
        const a = Math.floor((i / n) * peaks.length);
        const b = Math.max(a + 1, Math.floor(((i + 1) / n) * peaks.length));
        let m = 0;
        for (let j = a; j < b && j < peaks.length; j++) m = Math.max(m, peaks[j]);
        out[i] = 0.12 + m * 0.88;
      }
      return out;
    }
    // No decoded audio: a calm, deterministic idle ribbon that reads like speech
    // cadence (a timeline, not a fake progress bar).
    const out = new Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const envelope = 0.5 + 0.5 * Math.sin(t * 6.5 + 0.6); // slow phrases
      const detail =
        0.5 * Math.abs(Math.sin(t * 47)) + 0.5 * Math.abs(Math.sin(t * 113 + 2));
      const gap = Math.sin(t * 19) > 0.86 ? 0.15 : 1; // brief silences
      out[i] = Math.max(0.06, (0.12 + envelope * detail * 0.9) * gap);
    }
    return out;
  }, [peaks, width]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const css = (name: string) =>
    getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const iris = `rgb(${css("--iris")})`;
    const faint = `rgb(${css("--faint")})`;
    const border = `rgb(${css("--border")})`;

    const rangeStart = range ? range[0] : 0;
    const rangeEnd = range ? range[1] : duration;
    const xOf = (s: number) => (duration ? (s / duration) * width : 0);

    const pitch = width / bars.length;
    const bw = Math.max(2, pitch * 0.62);
    const mid = height / 2;

    for (let i = 0; i < bars.length; i++) {
      const x = i * pitch + (pitch - bw) / 2;
      const secs = (i / bars.length) * duration;
      const h = Math.max(3, bars[i] * (height - 14));

      let color = border;
      const inRange = secs >= rangeStart && secs <= rangeEnd;
      if (mode === "select") color = inRange ? iris : faint + "66";
      if (mode === "progress") color = secs <= progress * duration ? iris : border;
      if (mode === "play") {
        color = secs <= currentTime ? iris : border;
        if (highlight && secs >= highlight[0] && secs <= highlight[1])
          color = iris;
      }
      ctx.fillStyle = color;
      roundBar(ctx, x, mid - h / 2, bw, h, Math.min(bw / 2, 2));
    }

    // range shading + handles
    if (mode === "select" && range) {
      ctx.fillStyle = iris + "12";
      ctx.fillRect(xOf(rangeStart), 0, xOf(rangeEnd) - xOf(rangeStart), height);
      for (const s of [rangeStart, rangeEnd]) {
        const x = xOf(s);
        ctx.fillStyle = iris;
        roundBar(ctx, x - 1.5, 6, 3, height - 12, 1.5);
        ctx.beginPath();
        ctx.arc(x, height - 4, 4, 0, Math.PI * 2);
        ctx.arc(x, 4, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (mode === "play") {
      const x = xOf(currentTime);
      ctx.fillStyle = iris;
      ctx.fillRect(x - 1, 0, 2, height);
      ctx.beginPath();
      ctx.arc(x, 6, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    if (hoverX != null && (mode === "play" || mode === "select")) {
      ctx.strokeStyle = faint;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(hoverX, 0);
      ctx.lineTo(hoverX, height);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [
    bars, width, height, duration, range, mode, progress, currentTime, highlight,
    hoverX,
  ]);

  const secsAt = useCallback(
    (clientX: number) => {
      const el = wrapRef.current;
      if (!el) return 0;
      const rect = el.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      return ratio * duration;
    },
    [duration],
  );

  const onDown = (e: React.PointerEvent) => {
    const s = secsAt(e.clientX);
    if (mode === "select" && range) {
      const rect = wrapRef.current!.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const startPx = (range[0] / duration) * rect.width;
      const endPx = (range[1] / duration) * rect.width;
      if (Math.abs(px - startPx) < HANDLE_HIT) setDrag("start");
      else if (Math.abs(px - endPx) < HANDLE_HIT) setDrag("end");
      else {
        // click inside: move nearest handle
        setDrag(Math.abs(px - startPx) < Math.abs(px - endPx) ? "start" : "end");
        applyRange(Math.abs(px - startPx) < Math.abs(px - endPx) ? "start" : "end", s);
      }
      (e.target as Element).setPointerCapture(e.pointerId);
    } else if (mode === "play") {
      setDrag("seek");
      onSeek?.(s);
      (e.target as Element).setPointerCapture(e.pointerId);
    }
  };

  const applyRange = (which: "start" | "end", s: number) => {
    if (!range || !onRangeChange) return;
    const min = 0.5;
    if (which === "start")
      onRangeChange([Math.min(s, range[1] - min), range[1]]);
    else onRangeChange([range[0], Math.max(s, range[0] + min)]);
  };

  const onMove = (e: React.PointerEvent) => {
    const rect = wrapRef.current!.getBoundingClientRect();
    setHoverX(e.clientX - rect.left);
    if (!drag) return;
    const s = secsAt(e.clientX);
    if (drag === "seek") onSeek?.(s);
    else applyRange(drag, s);
  };

  const onUp = (e: React.PointerEvent) => {
    setDrag(null);
    try {
      (e.target as Element).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="select-none">
      <div
        ref={wrapRef}
        className="relative w-full cursor-pointer touch-none rounded-xl bg-surface-2/60 px-0"
        style={{ height }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={() => setHoverX(null)}
        role={mode === "progress" ? "progressbar" : "slider"}
        aria-label={
          mode === "select"
            ? "Transcription range"
            : mode === "progress"
              ? "Transcription progress"
              : "Playback position"
        }
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={
          mode === "progress"
            ? Math.round(progress * duration)
            : Math.round(currentTime)
        }
      >
        <canvas ref={canvasRef} className="h-full w-full" />
      </div>
      <div className="mt-1.5 flex justify-between px-0.5 font-mono text-[11px] text-faint tnum">
        <span>{clock(0)}</span>
        <span>{clock(duration / 2)}</span>
        <span>{clock(duration)}</span>
      </div>
    </div>
  );
}

function roundBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.fill();
}

/**
 * Best-effort audio peak extraction for the ribbon. Skips gracefully for very
 * large files — the ribbon still works as a timeline without peaks.
 */
export async function extractPeaks(
  assetUrl: string,
  sizeBytes: number,
  buckets = 900,
): Promise<number[] | null> {
  if (sizeBytes > 90 * 1024 * 1024) return null;
  try {
    const res = await fetch(assetUrl);
    const buf = await res.arrayBuffer();
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new Ctx();
    const audio = await ctx.decodeAudioData(buf);
    const data = audio.getChannelData(0);
    const block = Math.floor(data.length / buckets) || 1;
    const peaks: number[] = [];
    let max = 0.0001;
    for (let i = 0; i < buckets; i++) {
      let p = 0;
      for (let j = 0; j < block; j++) {
        const v = Math.abs(data[i * block + j] || 0);
        if (v > p) p = v;
      }
      peaks.push(p);
      if (p > max) max = p;
    }
    void ctx.close();
    return peaks.map((p) => Math.min(1, (p / max) ** 0.8));
  } catch {
    return null;
  }
}
