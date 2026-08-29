import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { onMediaDrop, pickMediaFile } from "@/lib/platform";
import { clock, relativeTime } from "@/lib/format";
import { IconFile, IconHistory, IconShield, IconWave } from "@/components/icons";

export function Intake() {
  const loadMedia = useStore((s) => s.loadMedia);
  const history = useStore((s) => s.history);
  const openHistoryEntry = useStore((s) => s.openHistoryEntry);
  const go = useStore((s) => s.go);
  const [dragging, setDragging] = useState(false);

  async function choose() {
    const picked = await pickMediaFile();
    if (picked) loadMedia(picked);
  }

  useEffect(() => {
    let un: (() => void) | undefined;
    onMediaDrop(
      (f) => loadMedia(f),
      (over) => setDragging(over),
    ).then((u) => (un = u));
    return () => un?.();
  }, [loadMedia]);

  const recent = history.slice(0, 4);

  return (
    <div className="mx-auto flex min-h-full max-w-2xl flex-col justify-center px-6 py-12">
      <div className="mb-8 text-center">
        <h1 className="text-balance text-3xl leading-tight sm:text-[2.1rem]">
          Turn anything spoken into text.
        </h1>
        <p className="mx-auto mt-3 max-w-[32rem] text-pretty text-[15px] leading-relaxed text-muted">
          Drop in an interview, lecture, podcast or voice memo. UtterAI
          transcribes it right here on your computer — no account, no upload.
        </p>
      </div>

      <button
        onClick={choose}
        className={`group relative flex flex-col items-center justify-center gap-4 rounded-3xl border-2 border-dashed px-6 py-14 transition-all ${
          dragging
            ? "border-iris bg-iris/8 scale-[1.01]"
            : "border-border bg-surface/60 hover:border-iris/60 hover:bg-surface"
        }`}
      >
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-iris/10 text-iris transition-transform group-hover:-translate-y-0.5">
          <IconWave className="h-7 w-7" />
        </span>
        <span className="text-center">
          <span className="block text-[15px] font-medium">
            {dragging ? "Drop to open" : "Choose an audio or video file"}
          </span>
          <span className="mt-1 block text-sm text-faint">
            or drag it anywhere onto this window
          </span>
        </span>
      </button>

      <div className="mt-4 flex items-center justify-center gap-1.5 text-xs text-faint">
        <IconShield className="h-3.5 w-3.5 text-teal" />
        Everything stays on this device. Works fully offline.
      </div>

      {recent.length > 0 && (
        <div className="mt-10">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-xs font-medium uppercase tracking-wider text-faint">
              Recent
            </h2>
            <button
              className="text-xs text-muted hover:text-text"
              onClick={() => go("history")}
            >
              See all
            </button>
          </div>
          <ul className="divide-y divide-border/70 overflow-hidden rounded-2xl border border-border bg-surface">
            {recent.map((h) => (
              <li key={h.id}>
                <button
                  onClick={() => openHistoryEntry(h)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2"
                >
                  <IconFile className="h-4 w-4 shrink-0 text-faint" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {h.source_name}
                    </span>
                    <span className="block text-xs text-faint">
                      {clock(h.duration)} · {relativeTime(h.created_at)}
                    </span>
                  </span>
                  <IconHistory className="h-4 w-4 shrink-0 text-faint" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
