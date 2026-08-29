/**
 * Thin platform layer. In the real app these call Tauri plugins; under
 * `VITE_UTTERAI_MOCK=1` (browser / tests / screenshots) they use web fallbacks.
 */
import { convertFileSrc } from "@tauri-apps/api/core";
import { MOCK } from "./mockBackend";

const MEDIA_EXTS = [
  "mp3", "wav", "m4a", "aac", "flac", "ogg", "opus", "wma", "aiff", "amr",
  "mp4", "mkv", "mov", "webm", "avi", "m4v", "wmv", "flv", "3gp", "mpeg", "mpg",
];

export async function pickMediaFile(): Promise<string | null> {
  if (MOCK) {
    const params = new URLSearchParams(location.search);
    return params.get("file") || "/demo/keynote-interview.mp3";
  }
  const { open } = await import("@tauri-apps/plugin-dialog");
  const picked = await open({
    multiple: false,
    filters: [{ name: "Audio & video", extensions: MEDIA_EXTS }],
  });
  return typeof picked === "string" ? picked : null;
}

export async function saveFileDialog(
  suggestedName: string,
  ext: string,
): Promise<string | null> {
  if (MOCK) return `/tmp/${suggestedName}`;
  const { save } = await import("@tauri-apps/plugin-dialog");
  const dest = await save({
    defaultPath: suggestedName,
    filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
  });
  return dest ?? null;
}

export function mediaSrc(path: string): string {
  // In mock mode there's no real file; return empty so the player stays inert.
  if (MOCK) return "";
  return convertFileSrc(path);
}

export async function revealPath(path: string): Promise<void> {
  if (MOCK) return;
  const { openPath } = await import("@tauri-apps/plugin-opener");
  await openPath(path).catch(() => {});
}

export async function openExternal(url: string): Promise<void> {
  if (MOCK) {
    window.open(url, "_blank", "noopener");
    return;
  }
  const { openUrl } = await import("@tauri-apps/plugin-opener");
  await openUrl(url).catch(() => {});
}

export async function onMediaDrop(
  cb: (path: string) => void,
  onDragState?: (over: boolean) => void,
): Promise<() => void> {
  if (MOCK) return () => {};
  const { getCurrentWebview } = await import("@tauri-apps/api/webview");
  const un = await getCurrentWebview().onDragDropEvent((e) => {
    if (e.payload.type === "over" || e.payload.type === "enter") onDragState?.(true);
    else if (e.payload.type === "leave") onDragState?.(false);
    else if (e.payload.type === "drop") {
      onDragState?.(false);
      const f = e.payload.paths?.[0];
      if (f) cb(f);
    }
  });
  return un;
}
