import { create } from "zustand";
import { api, asUserError, onJobUpdate } from "./ipc";
import { fileExists } from "./platform";
import {
  checkForUpdate,
  installStyle,
  relaunchApp,
  type InstallStyle,
  type UpdateSession,
} from "./updates";
import { confirmAction } from "@/components/ConfirmDialog";
import type {
  HistoryEntry,
  JobStage,
  JobUpdate,
  MediaInfo,
  ModelCatalog,
  Segment,
  Settings,
  Transcript,
  UpdateInfo,
  UserError,
} from "./types";

export type Route =
  | "intake"
  | "review"
  | "working"
  | "transcript"
  | "history"
  | "settings";

export interface Media {
  path: string;
  info: MediaInfo;
}

interface Job {
  id: string;
  overall: number;
  stage: JobStage;
  note: string;
  partials: Segment[];
  startedAt: number;
}

interface Toast {
  id: number;
  message: string;
  tone: "info" | "success" | "error";
}

export type UpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "ready"
  | "error"
  | "uptodate";

interface UpdateState {
  status: UpdateStatus;
  info: UpdateInfo | null;
  progress: number;
  /** Set once the user dismisses the banner for this session. */
  dismissed: boolean;
  /** What happens when the download finishes on this platform. */
  style: InstallStyle;
}

interface AppStore {
  ready: boolean;
  route: Route;
  settings: Settings | null;
  /** The theme actually in effect, after resolving "system". */
  resolvedTheme: "light" | "dark";
  models: ModelCatalog | null;
  history: HistoryEntry[];

  media: Media | null;
  /** True when a history entry's source recording is no longer on disk. */
  sourceMissing: boolean;
  /** null means "the whole file". */
  range: [number, number] | null;
  chosenModelId: string | null;
  chosenLanguage: string | null;
  translate: boolean;

  job: Job | null;
  transcript: Transcript | null;
  activeEntryId: string | null;

  error: UserError | null;
  toasts: Toast[];
  update: UpdateState;

  init: () => Promise<void>;
  go: (route: Route) => void;
  applyTheme: () => void;

  checkForUpdates: (opts?: { manual?: boolean }) => Promise<void>;
  installUpdate: () => Promise<void>;
  relaunchForUpdate: () => Promise<void>;
  dismissUpdate: () => void;

  loadMedia: (path: string) => Promise<void>;
  setRange: (range: [number, number] | null) => void;
  setChosenModel: (id: string) => void;
  setChosenLanguage: (code: string) => void;
  setTranslate: (v: boolean) => void;

  start: () => Promise<void>;
  cancel: () => Promise<void>;
  retry: () => Promise<void>;
  reset: () => void;

  refreshModels: () => Promise<void>;
  refreshHistory: () => Promise<void>;
  saveCurrentToHistory: () => Promise<void>;
  openHistoryEntry: (entry: HistoryEntry) => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;

  showError: (e: unknown) => void;
  dismissError: () => void;
  toast: (message: string, tone?: Toast["tone"]) => void;
  dropToast: (id: number) => void;
}

let jobUnlisten: (() => void) | null = null;
let toastSeq = 0;
/** The live updater handle between "available" and "ready". */
let pendingUpdate: UpdateSession | null = null;

/** Windows hands off to the installer and terminates this process from inside
 *  the download call, so the window vanishes mid-click. Say so first. */
function confirmInstall(version: string | undefined): Promise<boolean> {
  return confirmAction(
    `Install UtterAI ${version ?? "update"} now?`,
    "UtterAI will close and the installer will take over, then reopen when it's done.",
    { confirmLabel: "Close and install", danger: false },
  );
}

/** Small unique id — avoids `crypto.randomUUID`, which is undefined in some
 *  webviews where the app origin isn't treated as a secure context. */
function newLocalId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export const useStore = create<AppStore>((set, get) => ({
  ready: false,
  route: "intake",
  settings: null,
  resolvedTheme: "light",
  models: null,
  history: [],

  media: null,
  sourceMissing: false,
  range: null,
  chosenModelId: null,
  chosenLanguage: null,
  translate: false,

  job: null,
  transcript: null,
  activeEntryId: null,

  error: null,
  toasts: [],
  update: { status: "idle", info: null, progress: 0, dismissed: false, style: "restart" },

  init: async () => {
    try {
      const [settings, models, history] = await Promise.all([
        api.getSettings(),
        api.listModels(),
        api.getHistory(),
      ]);
      set({
        settings,
        models,
        history,
        chosenModelId: settings.default_model,
        chosenLanguage: settings.default_language,
        ready: true,
      });
      get().applyTheme();
      const autoload = await api.e2eAutoload().catch(() => null);
      if (autoload) get().loadMedia(autoload);
      if (settings.auto_update_check) {
        // Don't hold up the first paint for a network round-trip.
        setTimeout(() => get().checkForUpdates(), 1200);
      }
    } catch (e) {
      set({ ready: true });
      get().showError(e);
    }
  },

  checkForUpdates: async (opts) => {
    const manual = opts?.manual ?? false;
    const cur = get().update.status;
    if (cur === "checking" || cur === "downloading") return;
    set({ update: { ...get().update, status: "checking" } });
    try {
      const session = await checkForUpdate();
      if (!session) {
        pendingUpdate = null;
        set({
          update: { ...get().update, status: "uptodate", info: null, progress: 0, dismissed: false },
        });
        if (manual) get().toast("UtterAI is up to date", "success");
        return;
      }
      pendingUpdate = session;
      set({
        update: {
          status: "available",
          info: session.info,
          progress: 0,
          dismissed: false,
          style: await installStyle(),
        },
      });
    } catch (e) {
      pendingUpdate = null;
      set({ update: { ...get().update, status: "error" } });
      if (manual) get().showError(e);
    }
  },

  installUpdate: async () => {
    if (!pendingUpdate) return;

    // Installing kills whatever is running: on Windows the installer terminates
    // this process outright, and everywhere else the app has to restart. Either
    // way a transcription in flight is lost, with nothing saved.
    if (get().job) {
      get().toast(
        "Finish or cancel the transcription first — updating closes UtterAI",
        "error",
      );
      return;
    }

    const style = get().update.style;
    if (style === "handoff") {
      const ok = await confirmInstall(get().update.info?.version);
      if (!ok) return;
    }

    // The user opted in — let the progress and the restart prompt show in the
    // banner even if they'd dismissed the initial "available" notice.
    set({
      update: {
        ...get().update,
        status: "downloading",
        progress: 0,
        dismissed: false,
      },
    });
    try {
      await pendingUpdate.downloadAndInstall((fraction) => {
        set({ update: { ...get().update, progress: fraction } });
      });
      // Reached on the "restart" platforms only; on Windows the installer has
      // already replaced this process by now.
      set({ update: { ...get().update, status: "ready", progress: 1 } });
    } catch (e) {
      set({ update: { ...get().update, status: "error" } });
      get().showError(e);
    }
  },

  relaunchForUpdate: async () => {
    try {
      await relaunchApp();
    } catch (e) {
      get().showError(e);
    }
  },

  dismissUpdate: () =>
    set({ update: { ...get().update, dismissed: true } }),

  go: (route) => set({ route }),

  applyTheme: () => {
    const t = get().settings?.theme ?? "system";
    const prefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)",
    ).matches;
    const dark = t === "dark" || (t === "system" && prefersDark);
    document.documentElement.setAttribute(
      "data-theme",
      dark ? "dark" : "light",
    );
    // Kept in the store, not read back off the DOM at render time: with
    // theme="system" an OS switch changes the attribute without changing any
    // React state, so the header's sun/moon icon used to stay on the old one.
    set({ resolvedTheme: dark ? "dark" : "light" });
  },

  loadMedia: async (path) => {
    try {
      const info = await api.probeMedia(path);
      set({
        media: { path, info },
        sourceMissing: false,
        range: null,
        transcript: null,
        activeEntryId: null,
        route: "review",
      });
    } catch (e) {
      get().showError(e);
    }
  },

  setRange: (range) => set({ range }),
  setChosenModel: (id) => set({ chosenModelId: id }),
  setChosenLanguage: (code) => set({ chosenLanguage: code }),
  setTranslate: (v) => set({ translate: v }),

  start: async () => {
    const { media, range, chosenModelId, chosenLanguage, translate } = get();
    if (!media) return;

    if (jobUnlisten) {
      jobUnlisten();
      jobUnlisten = null;
    }
    // `start_transcription` spawns the worker and returns the id, but the
    // worker can emit its first events — a short clip's "done", even — before
    // that reply crosses the IPC boundary. Anything for an id we don't know yet
    // is parked rather than dropped, and replayed once the id arrives.
    let liveJobId: string | null = null;
    const parked: JobUpdate[] = [];

    jobUnlisten = await onJobUpdate((u) => {
      if (liveJobId === null) {
        parked.push(u);
        return;
      }
      apply(u);
    });

    function apply(u: JobUpdate) {
      const cur = get().job;
      if (!cur || u.job_id !== cur.id) return;
      if (u.phase === "progress") {
        set({
          job: {
            ...cur,
            overall: u.overall,
            stage: u.stage,
            note: u.note,
            partials: u.partial
              ? [...cur.partials, u.partial].slice(-40)
              : cur.partials,
          },
        });
      } else if (u.phase === "done") {
        set({ transcript: u.transcript, job: null, route: "transcript" });
        get().saveCurrentToHistory();
        get().toast("Transcript ready", "success");
      } else if (u.phase === "failed") {
        set({ job: null });
        if (u.error.code !== "cancelled") get().showError(u.error);
        else set({ route: "review" });
      }
    }

    try {
      const id = await api.startTranscription({
        input: media.path,
        range,
        model_id: chosenModelId,
        language: chosenLanguage,
        translate,
      });
      set({
        job: {
          id,
          overall: 0,
          stage: "preparing",
          note: "Getting ready",
          partials: [],
          startedAt: Date.now(),
        },
        route: "working",
      });
      liveJobId = id;
      for (const u of parked.splice(0)) apply(u);
    } catch (e) {
      get().showError(e);
    }
  },

  cancel: async () => {
    const job = get().job;
    if (job) await api.cancelTranscription(job.id).catch(() => {});
    set({ job: null, route: "review" });
  },

  retry: async () => {
    get().dismissError();
    await get().start();
  },

  reset: () =>
    set({
      media: null,
      sourceMissing: false,
      range: null,
      job: null,
      transcript: null,
      activeEntryId: null,
      route: "intake",
    }),

  refreshModels: async () => {
    try {
      set({ models: await api.listModels() });
    } catch (e) {
      get().showError(e);
    }
  },

  refreshHistory: async () => {
    try {
      set({ history: await api.getHistory() });
    } catch {
      /* non-fatal */
    }
  },

  saveCurrentToHistory: async () => {
    const { media, range, transcript, activeEntryId, history } = get();
    if (!media || !transcript) return;
    // Re-saving an entry (an inline edit, say) must keep its original date.
    // Stamping "now" moved week-old transcripts to the top of the list and
    // relabelled them "just now" every time a word was corrected.
    const existing = activeEntryId
      ? history.find((h) => h.id === activeEntryId)
      : undefined;
    const entry: HistoryEntry = {
      id: activeEntryId ?? newLocalId(),
      source_path: media.path,
      source_name: transcript.source_name,
      created_at: existing?.created_at ?? Math.floor(Date.now() / 1000),
      duration: transcript.duration,
      range,
      model_id: transcript.model_id,
      language: transcript.language,
      transcript,
    };
    try {
      await api.saveHistory(entry);
      set({ activeEntryId: entry.id });
      get().refreshHistory();
    } catch {
      /* history is best-effort */
    }
  },

  openHistoryEntry: async (entry) => {
    // Show the transcript immediately — it's stored with the entry and doesn't
    // depend on the media still being there.
    set({
      media: null,
      sourceMissing: false,
      range: entry.range,
      transcript: entry.transcript,
      activeEntryId: entry.id,
      route: "transcript",
    });

    // Then decide whether playback is actually on offer. A history entry can
    // easily outlive its recording — moved, renamed, deleted, on a drive that
    // isn't plugged in. Attaching the player anyway gave a play button that did
    // nothing at all when pressed.
    const present = await fileExists(entry.source_path).catch(() => false);
    if (get().activeEntryId !== entry.id) return; // moved on already
    if (!present) {
      set({ sourceMissing: true });
      return;
    }
    set({
      media: {
        path: entry.source_path,
        info: {
          duration_secs: entry.duration + (entry.range?.[0] ?? 0),
          container: "",
          size_bytes: 0,
          has_audio: true,
          has_video: false,
          audio_codec: null,
          video_codec: null,
          sample_rate: null,
          channels: null,
          kind_label: "",
        },
      },
    });
  },

  updateSettings: async (patch) => {
    const cur = get().settings;
    if (!cur) return;
    const next = { ...cur, ...patch };
    set({ settings: next });
    get().applyTheme();
    try {
      await api.setSettings(next);
    } catch (e) {
      get().showError(e);
    }
  },

  showError: (e) => set({ error: asUserError(e) }),
  dismissError: () => set({ error: null }),

  toast: (message, tone = "info") => {
    const id = ++toastSeq;
    set({ toasts: [...get().toasts, { id, message, tone }] });
    setTimeout(() => get().dropToast(id), 4200);
  },
  dropToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));
