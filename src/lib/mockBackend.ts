/**
 * In-browser mock of the Tauri backend. Enabled with `VITE_UTTERAI_MOCK=1`,
 * used for UI development, Playwright end-to-end tests, and landing-page
 * screenshots. It mirrors the real command + event contract in `ipc.ts`.
 */
import type {
  DependencyReport,
  HistoryEntry,
  MediaInfo,
  Settings,
  Transcript,
} from "./types";

export const MOCK = import.meta.env.VITE_UTTERAI_MOCK === "1";

type Handler = (payload: unknown) => void;
const listeners = new Map<string, Set<Handler>>();

export function mockListen(event: string, handler: Handler): () => void {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event)!.add(handler);
  return () => listeners.get(event)?.delete(handler);
}
function emit(event: string, payload: unknown) {
  listeners.get(event)?.forEach((h) => h(payload));
}

// A realistic-looking interview transcript for the mock. The first lines are
// streamed as the "live preview" during a mock job.
const MOCK_LINES: [number, number, string][] = [
  [0.0, 4.2, "Thanks for making the time this morning. Can you walk me through how the pilot started?"],
  [4.6, 11.0, "Of course. Last spring the council set aside a small budget to test whether we could cut response times on the east side."],
  [11.4, 17.2, "We weren't sure it would work, honestly. The area had been underserved for years and people had stopped calling."],
  [17.8, 23.9, "So the first thing we did was go door to door and just ask residents what they actually needed."],
  [24.4, 30.1, "What surprised you the most about those conversations?"],
  [30.6, 38.4, "How specific people were. It wasn't abstract. One family could tell you exactly which four minutes of the afternoon were the problem."],
  [39.0, 45.2, "And when you cut through that, the fix was usually smaller than we expected — a signal timing, a staffing overlap."],
  [45.8, 52.6, "The lesson we keep coming back to is: process only what you need to, and let the people closest to it tell you where to look."],
  [53.2, 58.9, "That's the same principle we brought to how we report the results back to the neighbourhood."],
  [59.4, 64.0, "So, in a sense — ask what you can do for your country, one street at a time."],
];

function buildTranscript(name: string, dur: number, offset: number): Transcript {
  const segs = MOCK_LINES.map(([s, e, text]) => ({
    start: s + offset,
    end: e + offset,
    text,
  }));
  // Group into a few paragraphs on the larger gaps.
  const paragraphs: { start: number; end: number; text: string }[] = [];
  let cur: { start: number; end: number; text: string } | null = null;
  for (const seg of segs) {
    if (cur && seg.start - cur.end > 0.45 && cur.text.length > 110) {
      paragraphs.push(cur);
      cur = null;
    }
    if (!cur) cur = { start: seg.start, end: seg.end, text: seg.text };
    else {
      cur.text += " " + seg.text;
      cur.end = seg.end;
    }
  }
  if (cur) paragraphs.push(cur);

  return {
    segments: segs,
    paragraphs,
    language: "en",
    model_id: "base",
    duration: dur,
    source_offset: offset,
    source_name: name,
  };
}

const settingsKey = "utterai-mock-settings";
const historyKey = "utterai-mock-history";

function loadSettings(): Settings {
  try {
    const s = JSON.parse(localStorage.getItem(settingsKey) || "null");
    if (s) return s;
  } catch {
    /* ignore */
  }
  return {
    default_model: "base",
    default_language: "auto",
    default_export_format: "txt",
    theme: "system",
    developer_mode: false,
    onboarding_complete: true,
    follow_playback: true,
  };
}
function loadHistory(): HistoryEntry[] {
  try {
    return JSON.parse(localStorage.getItem(historyKey) || "[]");
  } catch {
    return [];
  }
}

let jobCounter = 0;

export async function mockInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  await new Promise((r) => setTimeout(r, 40));
  switch (cmd) {
    case "get_settings":
      return loadSettings() as T;
    case "set_settings":
      localStorage.setItem(settingsKey, JSON.stringify(args!.settings));
      return undefined as T;
    case "list_models":
      return {
        selectable: [
          { id: "base", display: "Base", file: "ggml-base-q5_1.bin", size_bytes: 59707625, sha256: "", blurb: "Built in and ready to go. Solid everyday accuracy, very fast.", speed_hint: "~5× faster than real time", bundled: true, internal: false },
          { id: "small", display: "Small", file: "ggml-small-q5_1.bin", size_bytes: 190085487, sha256: "", blurb: "Noticeably better with accents, names and background noise.", speed_hint: "~2× faster than real time", bundled: false, internal: false },
          { id: "medium", display: "Medium", file: "ggml-medium-q5_0.bin", size_bytes: 539212467, sha256: "", blurb: "High accuracy for tricky audio. Slower and heavier on memory.", speed_hint: "about real time", bundled: false, internal: false },
          { id: "large-v3-turbo", display: "Large (Turbo)", file: "ggml-large-v3-turbo-q5_0.bin", size_bytes: 574041195, sha256: "", blurb: "The best accuracy UtterAI offers, tuned to stay reasonably quick.", speed_hint: "slightly faster than real time", bundled: false, internal: false },
        ],
        installed: [
          { id: "base", display: "Base", path: "/models/ggml-base-q5_1.bin", size_bytes: 59707625, verified: true },
        ],
        default_id: loadSettings().default_model,
        bundled_id: "base",
      } as T;
    case "dependency_check":
      return {
        ffmpeg_ok: true,
        ffprobe_ok: true,
        bundled_model_ok: true,
        models_installed: [{ id: "base", display: "Base", path: "/models/ggml-base-q5_1.bin", size_bytes: 59707625, verified: true }],
        data_dir: "/home/you/.local/share/UtterAI",
        free_space_mb: 84231,
      } as DependencyReport as T;
    case "probe_media": {
      const p = String(args!.path);
      const name = p.split(/[\\/]/).pop() || p;
      const isVideo = /\.(mp4|mkv|mov|webm|avi)$/i.test(name);
      if (/broken|corrupt/i.test(name)) {
        throw {
          code: "corrupt_media",
          title: "This file looks damaged",
          message: "We couldn't read the audio in this file. It may be incomplete or corrupted.",
          actions: ["Try re-downloading or re-exporting the file", "Pick a different file"],
          detail: "the media file appears to be corrupt or unreadable",
        };
      }
      return {
        duration_secs: 642,
        container: isVideo ? "mp4" : "mp3",
        size_bytes: 18_400_000,
        has_audio: true,
        has_video: isVideo,
        audio_codec: isVideo ? "aac" : "mp3",
        video_codec: isVideo ? "h264" : null,
        sample_rate: 44100,
        channels: 2,
        kind_label: isVideo ? "MP4 video" : "MP3 audio",
      } as MediaInfo as T;
    }
    case "start_transcription": {
      const req = args!.request as {
        input: string;
        range: [number, number] | null;
        model_id: string | null;
      };
      const jobId = `mock-${++jobCounter}`;
      const name = req.input.split(/[\\/]/).pop() || "audio.mp3";
      const offset = req.range?.[0] ?? 0;
      const dur = req.range ? req.range[1] - req.range[0] : 642;
      runMockJob(jobId, name, dur, offset);
      return jobId as T;
    }
    case "cancel_transcription":
      cancelled.add(String(args!.jobId));
      return undefined as T;
    case "get_history":
      return loadHistory() as T;
    case "save_history": {
      const h = loadHistory().filter((e) => e.id !== (args!.entry as HistoryEntry).id);
      h.unshift(args!.entry as HistoryEntry);
      localStorage.setItem(historyKey, JSON.stringify(h.slice(0, 50)));
      return undefined as T;
    }
    case "delete_history":
      localStorage.setItem(
        historyKey,
        JSON.stringify(loadHistory().filter((e) => e.id !== args!.id)),
      );
      return undefined as T;
    case "clear_history":
      localStorage.removeItem(historyKey);
      return undefined as T;
    case "render_export": {
      const t = args!.transcript as Transcript;
      return t.paragraphs.map((p) => p.text).join("\n\n") as T;
    }
    case "export_transcript":
      return undefined as T;
    case "download_model": {
      const id = String(args!.id);
      let f = 0;
      const iv = setInterval(() => {
        f += 0.08 + Math.random() * 0.05;
        if (f >= 1) {
          clearInterval(iv);
          emit("model-download-progress", { id, received: 1, total: 1, fraction: 1 });
          emit("model-download-done", { id });
        } else {
          emit("model-download-progress", { id, received: f, total: 1, fraction: f });
        }
      }, 260);
      return undefined as T;
    }
    case "cancel_download":
    case "remove_model":
    case "verify_model":
      return (cmd === "verify_model" ? true : undefined) as T;
    case "clear_cache":
      return 0 as T;
    default:
      throw new Error(`mock: unhandled command ${cmd}`);
  }
}

const cancelled = new Set<string>();

function runMockJob(jobId: string, name: string, dur: number, offset: number) {
  const steps = [
    { stage: "preparing", note: "Checking the file", overall: 0.03 },
    { stage: "extracting", note: "Preparing the audio", overall: 0.1 },
    { stage: "loading_model", note: "Loading the transcription model", overall: 0.16 },
  ] as const;
  let i = 0;
  const tick = () => {
    if (cancelled.has(jobId)) {
      emit("transcription-update", {
        phase: "failed",
        job_id: jobId,
        error: { code: "cancelled", title: "Transcription cancelled", message: "You stopped this transcription. Nothing was saved.", actions: [], detail: "cancelled" },
      });
      return;
    }
    if (i < steps.length) {
      const s = steps[i++];
      emit("transcription-update", { phase: "progress", job_id: jobId, overall: s.overall, stage: s.stage, note: s.note, partial: null });
      setTimeout(tick, 500);
      return;
    }
    const seg = i - steps.length;
    const previewCount = Math.min(6, MOCK_LINES.length);
    if (seg < previewCount) {
      const [s, e, text] = MOCK_LINES[seg];
      emit("transcription-update", {
        phase: "progress",
        job_id: jobId,
        overall: 0.17 + ((seg + 1) / previewCount) * 0.79,
        stage: "transcribing",
        note: "Transcribing",
        partial: { start: s + offset, end: e + offset, text },
      });
      i++;
      setTimeout(tick, 380);
      return;
    }
    emit("transcription-update", { phase: "progress", job_id: jobId, overall: 0.99, stage: "finalizing", note: "Tidying up the transcript", partial: null });
    setTimeout(() => {
      emit("transcription-update", {
        phase: "done",
        job_id: jobId,
        transcript: buildTranscript(name, dur, offset),
      });
    }, 500);
  };
  setTimeout(tick, 300);
}
