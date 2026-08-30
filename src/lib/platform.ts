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
  // Mock mode has no real file. Returning "" used to leave the player inert,
  // which meant playback — the part that broke most often — was the one thing
  // the browser test suite could never exercise. Hand back a short synthesised
  // tone instead so play/pause/seek run against a genuine media element.
  if (MOCK) return /nomedia/i.test(path) ? "" : mockToneUrl();
  return convertFileSrc(path);
}

let toneUrl: string | null = null;
/** A 10-second 16 kHz mono WAV, built once, as a blob URL. */
function mockToneUrl(): string {
  if (toneUrl) return toneUrl;
  const rate = 16_000;
  const samples = rate * 10;
  const buf = new ArrayBuffer(44 + samples * 2);
  const view = new DataView(buf);
  const ascii = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  ascii(0, "RIFF");
  view.setUint32(4, 36 + samples * 2, true);
  ascii(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, samples * 2, true);
  for (let i = 0; i < samples; i++) {
    const env = 0.25 * Math.sin((i / samples) * Math.PI * 8) ** 2;
    view.setInt16(44 + i * 2, Math.round(env * Math.sin((i / rate) * 2 * Math.PI * 220) * 32767), true);
  }
  toneUrl = URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
  return toneUrl;
}

/** Is the file still where we last saw it? Used before offering playback. */
export async function fileExists(path: string): Promise<boolean> {
  if (MOCK) return !/missing/i.test(path);
  try {
    const { exists } = await import("@tauri-apps/plugin-fs");
    return await exists(path);
  } catch {
    // If we can't tell, assume it's there — the player degrades honestly.
    return true;
  }
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
