/**
 * Thin wrapper around `@tauri-apps/plugin-updater`. The plugin runs the check
 * and the download in the Rust process (no webview network access), and only
 * ever contacts the release endpoint configured in `tauri.conf.json`.
 *
 * In mock mode the whole thing is simulated so the update UI is testable in a
 * plain browser: set `VITE_UTTERAI_MOCK_UPDATE=1` to make a check "find" one.
 */
import { MOCK } from "./mockBackend";
import type { UpdateInfo } from "./types";

/** Mock mode "finds" an update when built with VITE_UTTERAI_MOCK_UPDATE=1 or
 *  when the page is loaded with `?mockUpdate=1` (used by the UI tests). */
function mockUpdateWanted(): boolean {
  if (import.meta.env.VITE_UTTERAI_MOCK_UPDATE === "1") return true;
  try {
    return new URLSearchParams(location.search).get("mockUpdate") === "1";
  } catch {
    return false;
  }
}

export interface UpdateSession {
  info: UpdateInfo;
  /** Download + verify + stage the update. `onProgress` gets 0–1. */
  downloadAndInstall(onProgress: (fraction: number) => void): Promise<void>;
}

/**
 * How the platform's installer behaves once the download finishes — the two
 * are genuinely different, and the UI has to say the right thing.
 *
 *  - "restart": the update is staged in place and takes effect on next launch
 *    (Linux AppImage, and .deb once dpkg has run). We show "Restart now".
 *  - "handoff": the installer takes over and the app is terminated from inside
 *    `downloadAndInstall`, which therefore never returns (Windows NSIS/MSI —
 *    the plugin ends with `std::process::exit(0)`). We have to warn first,
 *    because from the user's side the window simply disappears.
 */
export type InstallStyle = "restart" | "handoff";

export async function installStyle(): Promise<InstallStyle> {
  if (MOCK) {
    return new URLSearchParams(location.search).get("handoff") === "1"
      ? "handoff"
      : "restart";
  }
  try {
    const { platform } = await import("@tauri-apps/plugin-os");
    return platform() === "windows" ? "handoff" : "restart";
  } catch {
    return "restart";
  }
}

export async function checkForUpdate(): Promise<UpdateSession | null> {
  if (MOCK) {
    if (!mockUpdateWanted()) return null;
    await delay(600);
    return mockSession();
  }

  const { check } = await import("@tauri-apps/plugin-updater");
  const update = await check();
  if (!update) return null;

  return {
    info: {
      version: update.version,
      currentVersion: update.currentVersion,
      notes: update.body ?? "",
      date: update.date ?? null,
    },
    async downloadAndInstall(onProgress) {
      let total = 0;
      let got = 0;
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          total = event.data.contentLength ?? 0;
        } else if (event.event === "Progress") {
          got += event.data.chunkLength;
          onProgress(total > 0 ? Math.min(got / total, 0.99) : 0);
        } else if (event.event === "Finished") {
          onProgress(1);
        }
      });
    },
  };
}

export async function relaunchApp(): Promise<void> {
  if (MOCK) {
    location.reload();
    return;
  }
  const { relaunch } = await import("@tauri-apps/plugin-process");
  await relaunch();
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function mockSession(): UpdateSession {
  return {
    info: {
      version: "9.9.9",
      currentVersion: __APP_VERSION__,
      notes: "• A faster Large model\n• Fixes for long files with chapter markers\n• Smaller download",
      date: new Date().toISOString(),
    },
    async downloadAndInstall(onProgress) {
      for (let f = 0; f < 1; f += 0.12) {
        await delay(180);
        onProgress(Math.min(f, 0.99));
      }
      onProgress(1);
      await delay(200);
    },
  };
}
