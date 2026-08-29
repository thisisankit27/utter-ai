import { useEffect, useMemo, useRef, useState } from "react";
import { mediaSrc, saveFileDialog } from "@/lib/platform";
import { useStore, type Media } from "@/lib/store";
import { api } from "@/lib/ipc";
import { clock, clockMs, languageName } from "@/lib/format";
import type { Segment, Transcript } from "@/lib/types";
import { SpeechRibbon } from "@/components/SpeechRibbon";
import { Menu, MenuItem, Segmented } from "@/components/ui";
import {
  IconCopy,
  IconDownload,
  IconPause,
  IconPlay,
  IconPlus,
  IconSearch,
} from "@/components/icons";

const FORMATS: { id: string; label: string }[] = [
  { id: "txt", label: "Plain text (.txt)" },
  { id: "txt_timestamped", label: "Text with timestamps (.txt)" },
  { id: "srt", label: "Subtitles (.srt)" },
  { id: "vtt", label: "Captions (.vtt)" },
  { id: "md", label: "Markdown (.md)" },
  { id: "json", label: "JSON (.json)" },
];

export function TranscriptView() {
  const stored = useStore((s) => s.transcript);
  const media = useStore((s) => s.media);
  if (!stored) return null;
  return <TranscriptInner stored={stored} media={media} />;
}

function TranscriptInner({
  stored,
  media,
}: {
  stored: Transcript;
  media: Media | null;
}) {
  const reset = useStore((s) => s.reset);
  const toast = useStore((s) => s.toast);
  const saveHistory = useStore((s) => s.saveCurrentToHistory);
  const showError = useStore((s) => s.showError);

  const [transcript, setTranscript] = useState<Transcript>(stored);
  const [view, setView] = useState<"readable" | "timestamped">("readable");
  const [query, setQuery] = useState("");
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const mediaRef = useRef<HTMLVideoElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => setTranscript(stored), [stored]);

  const src = media ? mediaSrc(media.path) : "";
  const offset = transcript.source_offset;
  const canPlay = !!media?.path;

  const rows = view === "readable" ? transcript.paragraphs : transcript.segments;

  const matches = useMemo(() => {
    if (!query.trim()) return new Set<number>();
    const q = query.toLowerCase();
    const set = new Set<number>();
    rows.forEach((r, i) => r.text.toLowerCase().includes(q) && set.add(i));
    return set;
  }, [query, rows]);

  const activeIdx = useMemo(
    () => rows.findIndex((r) => t >= r.start && t < r.end),
    [rows, t],
  );

  useEffect(() => {
    if (activeIdx < 0 || !useStore.getState().settings?.follow_playback) return;
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-row="${activeIdx}"]`,
    );
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeIdx]);

  function seek(secs: number) {
    if (mediaRef.current) mediaRef.current.currentTime = secs;
    setT(secs);
  }
  function playPause() {
    const el = mediaRef.current;
    if (!el) return;
    if (el.paused) {
      el.play();
      setPlaying(true);
    } else {
      el.pause();
      setPlaying(false);
    }
  }

  function editRow(i: number, text: string) {
    setTranscript((prev) => {
      const key = view === "readable" ? "paragraphs" : "segments";
      const next = { ...prev, [key]: prev[key].map((r, j) => (j === i ? { ...r, text } : r)) };
      return next;
    });
  }

  async function persistEdits() {
    useStore.setState({ transcript });
    await saveHistory();
  }

  async function copyAll() {
    const body =
      view === "readable"
        ? transcript.paragraphs.map((p) => p.text).join("\n\n")
        : transcript.segments.map((s) => `[${clock(s.start)}] ${s.text}`).join("\n");
    await copyText(body);
    toast("Copied to clipboard", "success");
  }

  async function doExport(format: string) {
    try {
      const ext = format === "srt" ? "srt" : format === "vtt" ? "vtt" : format === "json" ? "json" : format === "md" ? "md" : "txt";
      const suggested = `${transcript.source_name.replace(/\.[^.]+$/, "")}.${ext}`;
      const dest = await saveFileDialog(suggested, ext);
      if (!dest) return;
      await api.exportTranscript(transcript, format, dest);
      toast("Transcript exported", "success");
    } catch (e) {
      showError(e);
    }
  }

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col px-6 py-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-xl">{transcript.source_name}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className="chip">{languageName(transcript.language)}</span>
            <span className="chip capitalize">{transcript.model_id.replace(/-/g, " ")}</span>
            <span className="chip tnum">{clock(transcript.duration)}</span>
            {offset > 0 && (
              <span className="chip tnum">from {clock(offset)}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-outline px-3" onClick={copyAll} aria-label="Copy transcript">
            <IconCopy className="h-4 w-4" /> Copy
          </button>
          <Menu
            trigger={({ toggle }) => (
              <button className="btn-primary px-3" onClick={toggle}>
                <IconDownload className="h-4 w-4" /> Export
              </button>
            )}
          >
            {FORMATS.map((f) => (
              <MenuItem key={f.id} onSelect={() => doExport(f.id)}>
                {f.label}
              </MenuItem>
            ))}
          </Menu>
        </div>
      </div>

      {canPlay && (
        <div className="mt-4 rounded-2xl border border-border bg-surface p-3">
          <div className="flex items-center gap-3">
            <button
              onClick={playPause}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-iris text-white"
              aria-label={playing ? "Pause" : "Play"}
            >
              {playing ? <IconPause className="h-4 w-4" /> : <IconPlay className="h-4 w-4" />}
            </button>
            <div className="flex-1">
              <SpeechRibbon
                duration={transcript.duration}
                mode="play"
                currentTime={t - offset}
                onSeek={(s) => seek(s + offset)}
                highlight={
                  activeIdx >= 0
                    ? [rows[activeIdx].start - offset, rows[activeIdx].end - offset]
                    : null
                }
                height={54}
              />
            </div>
            <span className="shrink-0 font-mono text-xs text-faint tnum">
              {clock(Math.max(0, t - offset))} / {clock(transcript.duration)}
            </span>
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <Segmented
          value={view}
          onChange={(v) => setView(v as "readable" | "timestamped")}
          options={[
            { value: "readable", label: "Readable" },
            { value: "timestamped", label: "Timestamped" },
          ]}
          size="sm"
        />
        <div className="relative">
          <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <input
            className="input w-52 pl-8 text-sm"
            placeholder={`Search${matches.size ? ` — ${matches.size} found` : ""}`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      <div
        ref={listRef}
        className="mt-3 flex-1 overflow-y-auto rounded-2xl border border-border bg-surface"
      >
        <div
          className={
            view === "readable"
              ? "space-y-3 py-5 pl-16 pr-6"
              : "divide-y divide-border/60"
          }
        >
          {rows.map((row, i) => (
            <Row
              key={i}
              index={i}
              row={row}
              view={view}
              offset={offset}
              active={i === activeIdx}
              matched={matches.has(i)}
              query={query}
              onSeek={() => canPlay && seek(row.start)}
              onEdit={(text) => editRow(i, text)}
              onCommit={persistEdits}
            />
          ))}
        </div>
      </div>

      <div className="mt-4 flex justify-between">
        <button className="btn-ghost text-sm" onClick={reset}>
          <IconPlus className="h-4 w-4" /> New transcription
        </button>
      </div>

      <video
        ref={mediaRef}
        src={src}
        className="hidden"
        onTimeUpdate={(e) => setT(e.currentTarget.currentTime)}
        onEnded={() => setPlaying(false)}
      />
    </div>
  );
}

function Row({
  index,
  row,
  view,
  offset,
  active,
  matched,
  query,
  onSeek,
  onEdit,
  onCommit,
}: {
  index: number;
  row: Segment;
  view: "readable" | "timestamped";
  offset: number;
  active: boolean;
  matched: boolean;
  query: string;
  onSeek: () => void;
  onEdit: (text: string) => void;
  onCommit: () => void;
}) {
  const [editing, setEditing] = useState(false);

  if (view === "timestamped") {
    return (
      <div
        data-row={index}
        className={`flex gap-3 px-4 py-2.5 transition-colors ${
          active ? "bg-iris/8" : matched ? "bg-amber/8" : ""
        }`}
      >
        <button
          onClick={onSeek}
          className="shrink-0 pt-0.5 font-mono text-xs text-iris tnum hover:underline"
        >
          {clockMs(row.start - offset)}
        </button>
        <EditableText
          editing={editing}
          setEditing={setEditing}
          text={row.text}
          query={query}
          onEdit={onEdit}
          onCommit={onCommit}
          className="text-sm leading-relaxed"
        />
      </div>
    );
  }

  return (
    <div
      data-row={index}
      onClick={(e) => {
        if (!editing && (e.target as HTMLElement).tagName !== "MARK") onSeek();
      }}
      className={`group relative cursor-pointer rounded-lg py-1.5 pl-4 pr-2 text-[15px] leading-[1.75] transition-colors ${
        active
          ? "bg-iris/8 before:absolute before:inset-y-1 before:left-0 before:w-[3px] before:rounded-full before:bg-iris"
          : matched
            ? "bg-amber/8"
            : "hover:bg-surface-2/60"
      }`}
    >
      <span className="pointer-events-none absolute -left-12 top-2 font-mono text-[11px] text-faint tnum opacity-60 transition group-hover:opacity-100">
        {clock(row.start - offset)}
      </span>
      <EditableText
        as="span"
        editing={editing}
        setEditing={setEditing}
        text={row.text}
        query={query}
        onEdit={onEdit}
        onCommit={onCommit}
      />
    </div>
  );
}

function EditableText({
  text,
  query,
  editing,
  setEditing,
  onEdit,
  onCommit,
  className,
  as = "div",
}: {
  text: string;
  query: string;
  editing: boolean;
  setEditing: (v: boolean) => void;
  onEdit: (t: string) => void;
  onCommit: () => void;
  className?: string;
  as?: "div" | "span";
}) {
  if (editing) {
    return (
      <textarea
        autoFocus
        defaultValue={text}
        className="input min-h-[2.5rem] w-full resize-y text-sm"
        onBlur={(e) => {
          onEdit(e.target.value.trim());
          setEditing(false);
          onCommit();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey))
            (e.target as HTMLTextAreaElement).blur();
          if (e.key === "Escape") setEditing(false);
        }}
      />
    );
  }
  const Tag = as;
  return (
    <Tag
      className={`${className ?? ""} cursor-text`}
      onDoubleClick={() => setEditing(true)}
      title="Double-click to edit"
    >
      {highlight(text, query)}
    </Tag>
  );
}

function highlight(text: string, query: string) {
  if (!query.trim()) return text;
  const parts = text.split(new RegExp(`(${escapeRe(query)})`, "ig"));
  return parts.map((p, i) =>
    p.toLowerCase() === query.toLowerCase() ? (
      <mark key={i} className="rounded bg-amber/40 px-0.5 text-text">
        {p}
      </mark>
    ) : (
      p
    ),
  );
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    /* clipboard unavailable */
  }
}
