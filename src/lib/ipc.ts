import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import { listen as tauriListen, type UnlistenFn } from "@tauri-apps/api/event";
import { MOCK, mockInvoke, mockListen } from "./mockBackend";
import type {
  DependencyReport,
  HistoryEntry,
  JobUpdate,
  MediaInfo,
  ModelCatalog,
  ModelDownloadProgress,
  Settings,
  Transcript,
  UserError,
} from "./types";

function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  return MOCK ? mockInvoke<T>(cmd, args) : tauriInvoke<T>(cmd, args);
}
function listen<T>(event: string, cb: (e: { payload: T }) => void): Promise<UnlistenFn> {
  if (MOCK) {
    return Promise.resolve(
      mockListen(event, (payload) => cb({ payload: payload as T })),
    );
  }
  return tauriListen<T>(event, cb);
}

/** A rejected command comes back as a UserError payload or a plain string. */
export function asUserError(e: unknown): UserError {
  if (e && typeof e === "object" && "title" in e && "message" in e) {
    return e as UserError;
  }
  return {
    code: "unexpected",
    title: "Something went wrong",
    message: typeof e === "string" ? e : "UtterAI hit an unexpected problem.",
    actions: ["Try again"],
    detail: String(e),
  };
}

export const api = {
  getSettings: () => invoke<Settings>("get_settings"),
  setSettings: (settings: Settings) => invoke<void>("set_settings", { settings }),

  dependencyCheck: () => invoke<DependencyReport>("dependency_check"),
  listModels: () => invoke<ModelCatalog>("list_models"),
  downloadModel: (id: string) => invoke<void>("download_model", { id }),
  cancelDownload: () => invoke<void>("cancel_download"),
  removeModel: (id: string) => invoke<void>("remove_model", { id }),
  verifyModel: (id: string) => invoke<boolean>("verify_model", { id }),

  probeMedia: (path: string) => invoke<MediaInfo>("probe_media", { path }),

  startTranscription: (request: {
    input: string;
    range: [number, number] | null;
    model_id: string | null;
    language: string | null;
    translate: boolean;
  }) => invoke<string>("start_transcription", { request }),
  cancelTranscription: (jobId: string) =>
    invoke<void>("cancel_transcription", { jobId }),

  renderExport: (transcript: Transcript, format: string) =>
    invoke<string>("render_export", { transcript, format }),
  exportTranscript: (transcript: Transcript, format: string, dest: string) =>
    invoke<void>("export_transcript", { transcript, format, dest }),

  getHistory: () => invoke<HistoryEntry[]>("get_history"),
  saveHistory: (entry: HistoryEntry) => invoke<void>("save_history", { entry }),
  deleteHistory: (id: string) => invoke<void>("delete_history", { id }),
  clearHistory: () => invoke<void>("clear_history"),

  clearCache: () => invoke<number>("clear_cache"),
};

export function onJobUpdate(cb: (u: JobUpdate) => void): Promise<UnlistenFn> {
  return listen<JobUpdate>("transcription://update", (e) => cb(e.payload));
}

export function onModelDownloadProgress(
  cb: (p: ModelDownloadProgress) => void,
): Promise<UnlistenFn> {
  return listen<ModelDownloadProgress>("model://download-progress", (e) =>
    cb(e.payload),
  );
}

export function onModelDownloadDone(
  cb: (id: string) => void,
): Promise<UnlistenFn> {
  return listen<{ id: string }>("model://download-done", (e) =>
    cb(e.payload.id),
  );
}
