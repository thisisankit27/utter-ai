import { create } from "zustand";
import { api, asUserError, onJobUpdate } from "./ipc";
import type {
  HistoryEntry,
  JobStage,
  MediaInfo,
  ModelCatalog,
  Segment,
  Settings,
  Transcript,
  UserError,
} from "./types";

export type Route =
  | "intake"
  | "review"
  | "working"
  | "transcript"
  | "history"
  | "settings";

interface Media {
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

interface AppStore {
  ready: boolean;
  route: Route;
  settings: Settings | null;
  models: ModelCatalog | null;
  history: HistoryEntry[];

  media: Media | null;
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

  init: () => Promise<void>;
  go: (route: Route) => void;
  applyTheme: () => void;

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
  openHistoryEntry: (entry: HistoryEntry) => void;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;

  showError: (e: unknown) => void;
  dismissError: () => void;
  toast: (message: string, tone?: Toast["tone"]) => void;
  dropToast: (id: number) => void;
}

let jobUnlisten: (() => void) | null = null;
let toastSeq = 0;

export const useStore = create<AppStore>((set, get) => ({
  ready: false,
  route: "intake",
  settings: null,
  models: null,
  history: [],

  media: null,
  range: null,
  chosenModelId: null,
  chosenLanguage: null,
  translate: false,

  job: null,
  transcript: null,
  activeEntryId: null,

  error: null,
  toasts: [],

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
    } catch (e) {
      set({ ready: true });
      get().showError(e);
    }
  },

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
  },

  loadMedia: async (path) => {
    try {
      const info = await api.probeMedia(path);
      set({
        media: { path, info },
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
    jobUnlisten = await onJobUpdate((u) => {
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
    });

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
    const { media, range, transcript } = get();
    if (!media || !transcript) return;
    const entry: HistoryEntry = {
      id: get().activeEntryId ?? crypto.randomUUID(),
      source_path: media.path,
      source_name: media.info.kind_label
        ? transcript.source_name
        : transcript.source_name,
      created_at: Math.floor(Date.now() / 1000),
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

  openHistoryEntry: (entry) => {
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
      range: entry.range,
      transcript: entry.transcript,
      activeEntryId: entry.id,
      route: "transcript",
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
