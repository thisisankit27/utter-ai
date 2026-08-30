import { useEffect, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { clock, eta } from "@/lib/format";
import { IconCheck, IconX } from "@/components/icons";
import { Spinner } from "@/components/ui";

const STEPS = [
  { key: "prepare", label: "Preparing audio", stages: ["preparing", "extracting"] },
  { key: "transcribe", label: "Transcribing", stages: ["loading_model", "transcribing"] },
  { key: "finalize", label: "Finalising", stages: ["finalizing"] },
];

export function Working() {
  const job = useStore((s) => s.job);
  const cancel = useStore((s) => s.cancel);
  const media = useStore((s) => s.media);
  const previewRef = useRef<HTMLDivElement>(null);
  const [elapsed, setElapsed] = useState(0);

  // Keyed on the start time, not the whole job object: `job` is replaced on
  // every progress tick (several a second), which tore this interval down and
  // rebuilt it each time.
  const startedAt = job?.startedAt;
  useEffect(() => {
    if (startedAt == null) return;
    setElapsed(Date.now() - startedAt);
    const i = setInterval(() => setElapsed(Date.now() - startedAt), 500);
    return () => clearInterval(i);
  }, [startedAt]);

  useEffect(() => {
    previewRef.current?.scrollTo({ top: previewRef.current.scrollHeight });
  }, [job?.partials.length]);

  if (!job) return null;

  const currentStepIdx = STEPS.findIndex((s) => s.stages.includes(job.stage));
  const pct = Math.round(job.overall * 100);
  const remaining = eta(job.overall, elapsed);

  return (
    <div className="mx-auto flex min-h-full max-w-2xl flex-col justify-center px-6 py-10">
      <div className="text-center">
        <p className="text-xs font-medium uppercase tracking-wider text-faint">
          {media ? baseName(media.path) : "Transcribing"}
        </p>
        <h1 className="mt-2 text-2xl">{job.note}</h1>
        <p className="mt-1 text-sm text-muted">
          {remaining ?? "Working through the audio"} · {clock(elapsed / 1000)} elapsed
        </p>
      </div>

      <div className="mt-8">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-sm font-medium tnum">{pct}%</span>
          <span className="text-xs text-faint">
            {job.stage === "transcribing"
              ? "Real progress from the model"
              : "This part is usually quick"}
          </span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full rounded-full bg-iris transition-[width] duration-500 ease-out"
            style={{ width: `${Math.max(2, pct)}%` }}
          />
        </div>
      </div>

      <ol className="mt-7 space-y-2.5">
        {STEPS.map((step, i) => {
          const done = i < currentStepIdx;
          const active = i === currentStepIdx;
          return (
            <li key={step.key} className="flex items-center gap-3 text-sm">
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full border text-xs ${
                  done
                    ? "border-teal/40 bg-teal/12 text-teal"
                    : active
                      ? "border-iris/50 bg-iris/12 text-iris"
                      : "border-border text-faint"
                }`}
              >
                {done ? (
                  <IconCheck className="h-3.5 w-3.5" />
                ) : active ? (
                  <Spinner className="h-3.5 w-3.5" />
                ) : (
                  i + 1
                )}
              </span>
              <span className={active || done ? "text-text" : "text-faint"}>
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>

      {job.partials.length > 0 && (
        <div className="mt-7">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-faint">
            Live preview
          </p>
          <div
            ref={previewRef}
            className="max-h-44 overflow-y-auto rounded-2xl border border-border bg-surface p-4 text-sm leading-relaxed text-muted"
          >
            {job.partials.map((p, i) => (
              <span key={i} className={i === job.partials.length - 1 ? "text-text" : ""}>
                {p.text}{" "}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mt-8 flex justify-center">
        <button className="btn-ghost text-sm" onClick={cancel}>
          <IconX className="h-4 w-4" /> Cancel transcription
        </button>
      </div>
    </div>
  );
}

function baseName(p: string) {
  return p.split(/[\\/]/).pop() ?? p;
}
