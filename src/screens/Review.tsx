import { useEffect, useMemo, useState } from "react";
import { mediaSrc } from "@/lib/platform";
import { useStore, type Media } from "@/lib/store";
import { clock } from "@/lib/format";
import { LANGUAGES } from "@/lib/format";
import { useMediaPlayer } from "@/lib/useMediaPlayer";
import { MediaElement } from "@/components/MediaElement";
import { SpeechRibbon, extractPeaks } from "@/components/SpeechRibbon";
import { Segmented, Select } from "@/components/ui";
import {
  IconAlert,
  IconArrowLeft,
  IconDownload,
  IconPause,
  IconPlay,
  IconWave,
} from "@/components/icons";

export function Review() {
  const media = useStore((s) => s.media);
  if (!media) return null;
  // Keyed by path: picking a different file (including by drag-and-drop, which
  // swaps the media without leaving this screen) must not carry over the
  // previous file's range mode, playhead or waveform.
  return <ReviewInner key={media.path} media={media} />;
}

function ReviewInner({ media }: { media: Media }) {
  const range = useStore((s) => s.range);
  const setRange = useStore((s) => s.setRange);
  const start = useStore((s) => s.start);
  const reset = useStore((s) => s.reset);
  const models = useStore((s) => s.models);
  const chosenModelId = useStore((s) => s.chosenModelId);
  const setChosenModel = useStore((s) => s.setChosenModel);
  const chosenLanguage = useStore((s) => s.chosenLanguage) ?? "auto";
  const setChosenLanguage = useStore((s) => s.setChosenLanguage);
  const translate = useStore((s) => s.translate);
  const setTranslate = useStore((s) => s.setTranslate);

  const duration = media.info.duration_secs;
  const [peaks, setPeaks] = useState<number[] | null>(null);
  const [mode, setMode] = useState<"whole" | "range">(range ? "range" : "whole");

  const src = useMemo(() => mediaSrc(media.path) || null, [media.path]);
  const player = useMediaPlayer(src);
  const { playing, currentTime: t, error: playError, toggle: playPause, seek } = player;

  useEffect(() => {
    let alive = true;
    if (!src) return;
    extractPeaks(src, media.info.size_bytes).then((p) => {
      if (alive) setPeaks(p);
    });
    return () => {
      alive = false;
    };
  }, [src, media.info.size_bytes]);

  const working = useMemo<[number, number]>(
    () => range ?? [0, duration],
    [range, duration],
  );

  function toggleMode(next: "whole" | "range") {
    setMode(next);
    if (next === "whole") setRange(null);
    else setRange(range ?? [0, Math.min(duration, Math.max(30, duration * 0.25))]);
  }

  const installedIds = new Set(models?.installed.map((m) => m.id));
  const spanSecs = mode === "whole" ? duration : working[1] - working[0];

  // Starting a run with a model that was never downloaded fails deep in the
  // backend with "model unavailable". Catch it here, where we can say so.
  const activeModelId = chosenModelId ?? models?.default_id ?? "base";
  const activeModel = models?.selectable.find((m) => m.id === activeModelId);
  const modelReady =
    !models || !activeModel || activeModel.bundled || installedIds.has(activeModelId);

  // In range mode the preview should play the range, not the whole file.
  function previewToggle() {
    if (mode === "range" && !playing) {
      const [from, to] = working;
      if (t < from || t >= to) seek(from);
    }
    playPause();
  }

  // Stop at the end of the selected range so "play" means "play what I chose".
  useEffect(() => {
    if (mode !== "range" || !playing) return;
    if (t >= working[1]) player.pause();
  }, [mode, playing, t, working, player]);

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <button
        onClick={reset}
        className="btn-ghost -ml-2 mb-4 px-2 text-sm"
      >
        <IconArrowLeft className="h-4 w-4" /> Choose a different file
      </button>

      <div className="card overflow-hidden">
        <div className="flex items-center gap-3 border-b border-border/70 px-5 py-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-iris/10 text-iris">
            <IconWave className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold">
              {baseName(media.path)}
            </h1>
            <p className="text-xs text-faint">
              {media.info.kind_label || "Media"} · {clock(duration)}
              {media.info.channels ? ` · ${media.info.channels === 1 ? "mono" : "stereo"}` : ""}
            </p>
          </div>
          <button
            onClick={previewToggle}
            className="btn-outline px-3 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!!playError}
            title={playError ? playError.message : undefined}
            aria-label={playing ? "Pause preview" : "Play preview"}
          >
            {playing ? <IconPause className="h-4 w-4" /> : <IconPlay className="h-4 w-4" />}
          </button>
        </div>

        {playError && (
          <p className="flex items-start gap-2 border-b border-border/70 bg-amber/8 px-5 py-2.5 text-xs text-muted">
            <IconAlert className="mt-px h-3.5 w-3.5 shrink-0 text-amber" />
            {playError.message}
          </p>
        )}

        <div className="px-5 py-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <Segmented
              value={mode}
              onChange={(v) => toggleMode(v as "whole" | "range")}
              options={[
                { value: "whole", label: "Whole file" },
                { value: "range", label: "Choose a range" },
              ]}
            />
            <p className="text-sm text-muted">
              Will transcribe{" "}
              <span className="font-semibold text-text tnum">
                {clock(spanSecs)}
              </span>{" "}
              of audio
            </p>
          </div>

          <SpeechRibbon
            duration={duration}
            peaks={peaks}
            mode={mode === "range" ? "select" : "play"}
            range={mode === "range" ? working : null}
            onRangeChange={setRange}
            currentTime={t}
            onSeek={mode === "whole" ? seek : undefined}
            height={110}
          />

          {mode === "range" && (
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-[1fr_1fr_auto]">
              <TimeField
                label="Start"
                value={working[0]}
                max={working[1] - 0.5}
                onChange={(v) => setRange([v, working[1]])}
              />
              <TimeField
                label="End"
                value={working[1]}
                max={duration}
                min={working[0] + 0.5}
                onChange={(v) => setRange([working[0], v])}
              />
              <div className="col-span-2 flex flex-wrap items-end gap-2 sm:col-span-1">
                {presets(duration).map((p) => (
                  <button
                    key={p.label}
                    className="chip hover:border-iris/50 hover:text-text"
                    onClick={() => setRange(p.range)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="grid gap-4 border-t border-border/70 px-5 py-4 sm:grid-cols-2">
          <label className="block">
            <span className="field-label">Model</span>
            <Select
              ariaLabel="Transcription model"
              value={chosenModelId ?? models?.default_id ?? "base"}
              onChange={setChosenModel}
            >
              {models?.selectable.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.display}
                  {installedIds.has(m.id) ? "" : " — download needed"}
                </option>
              ))}
            </Select>
          </label>
          <label className="block">
            <span className="field-label">Language</span>
            <Select
              ariaLabel="Spoken language"
              value={chosenLanguage}
              onChange={setChosenLanguage}
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex items-center gap-2 text-sm text-muted sm:col-span-2">
            <input
              type="checkbox"
              className="h-4 w-4 accent-iris"
              checked={translate}
              onChange={(e) => setTranslate(e.target.checked)}
            />
            Translate the result into English
          </label>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-end gap-3">
        {!modelReady && (
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <IconDownload className="h-3.5 w-3.5" />
            {activeModel?.display} isn&apos;t downloaded yet — get it in Settings.
          </p>
        )}
        <button
          className="btn-primary px-6 py-3 text-[15px] disabled:cursor-not-allowed disabled:opacity-50"
          onClick={start}
          disabled={!modelReady}
        >
          Start transcription
        </button>
      </div>

      <MediaElement src={src} elRef={player.ref} />
    </div>
  );
}

function TimeField({
  label,
  value,
  onChange,
  min = 0,
  max,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max: number;
}) {
  const [text, setText] = useState(clock(value));
  useEffect(() => setText(clock(value)), [value]);
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <input
        className="input font-mono tnum"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const secs = parseClock(text);
          if (secs != null)
            onChange(Math.min(max, Math.max(min, secs)));
          else setText(clock(value));
        }}
        inputMode="numeric"
        aria-label={`${label} time, mm:ss`}
      />
    </label>
  );
}

function parseClock(s: string): number | null {
  const parts = s.trim().split(":").map(Number);
  if (parts.some((n) => Number.isNaN(n))) return null;
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

function presets(duration: number): { label: string; range: [number, number] }[] {
  const five = Math.min(300, duration);
  const out: { label: string; range: [number, number] }[] = [
    { label: "First 5 min", range: [0, five] },
  ];
  if (duration > 600)
    out.push({
      label: "Middle 5 min",
      range: [duration / 2 - 150, duration / 2 + 150],
    });
  if (duration > 300)
    out.push({ label: "Last 5 min", range: [Math.max(0, duration - 300), duration] });
  return out;
}

function baseName(p: string) {
  return p.split(/[\\/]/).pop() ?? p;
}
