import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * End-to-end walkthrough of the packaged app via tauri-driver.
 *
 * Requires:
 *   - a `tauri build` at target/release/utterai[.exe] (a plain `cargo build`
 *     runs in dev mode and expects the vite server)
 *   - `tauri-driver` on PATH (`cargo install tauri-driver --locked`)
 *   - the platform WebDriver: WebKitWebDriver on Linux (`webkit2gtk-driver`),
 *     msedgedriver on Windows — its version must match the installed Edge /
 *     WebView2 runtime; grab it from
 *     https://developer.microsoft.com/microsoft-edge/tools/webdriver/ and put it
 *     on PATH or point NATIVE_DRIVER at it.
 *
 * On Linux, run under xvfb. On Windows, a real desktop session is enough.
 *
 * The app reads a media path from a sentinel file on boot (see the
 * `e2e_autoload` command) so the walkthrough skips the native file dialog.
 */
const ROOT = path.resolve(__dirname, "..");
const IS_WIN = process.platform === "win32";
const EXE = IS_WIN ? ".exe" : "";

const APP =
  process.env.UTTERAI_BIN || path.join(ROOT, `target/release/utterai${EXE}`);
const FIXTURE =
  process.env.UTTERAI_FIXTURE || path.join(ROOT, "fixtures/jfk.wav");
const SENTINEL =
  process.env.UTTERAI_E2E_FILE || path.join(os.tmpdir(), "utterai-e2e-autoload");

/** Locate the platform's native WebDriver, or explain how to get it. */
function resolveNativeDriver(): string {
  if (process.env.NATIVE_DRIVER) return process.env.NATIVE_DRIVER;
  if (IS_WIN) {
    // tauri-driver shells out by name; it must be on PATH.
    return "msedgedriver.exe";
  }
  for (const p of [
    "/usr/bin/WebKitWebDriver",
    "/usr/bin/webkit2gtk-driver",
    "/usr/lib/webkit2gtk-4.1/WebKitWebDriver",
  ]) {
    if (fs.existsSync(p)) return p;
  }
  return "WebKitWebDriver";
}

let tauriDriver: ChildProcess;

export const config: WebdriverIO.Config = {
  runner: "local",
  specs: ["./e2e/**/*.e2e.ts"],
  maxInstances: 1,
  capabilities: [
    {
      // @ts-expect-error tauri-specific capability
      "tauri:options": { application: APP },
    },
  ],
  hostname: "127.0.0.1",
  port: 4444,
  logLevel: "warn",
  framework: "mocha",
  reporters: ["spec"],
  mochaOpts: { ui: "bdd", timeout: 420_000 },
  autoCompileOpts: {
    autoCompile: true,
    tsNodeOpts: { transpileOnly: true, project: "./tests/tsconfig.json" },
  },

  onPrepare: () => {
    if (!fs.existsSync(APP)) {
      const bundles = IS_WIN ? "nsis" : "deb";
      throw new Error(
        `App binary not found at ${APP}. Run: npm run tauri build -- --bundles ${bundles}`,
      );
    }
    fs.mkdirSync(path.join(ROOT, "tests/artifacts"), { recursive: true });
    fs.writeFileSync(SENTINEL, FIXTURE);
    // The app only honours the autoload sentinel when this is set, so a shipped
    // build can't be steered by a stray file in the temp directory. It reaches
    // the app by inheritance: wdio → tauri-driver → the app.
    process.env.UTTERAI_E2E_FILE = SENTINEL;
  },
  onComplete: () => {
    try {
      fs.unlinkSync(SENTINEL);
    } catch {
      /* ignore */
    }
  },
  beforeSession: () => {
    const nativeDriver = resolveNativeDriver();
    tauriDriver = spawn(
      "tauri-driver",
      ["--port", "4444", "--native-driver", nativeDriver],
      { stdio: [null, process.stdout, process.stderr], shell: IS_WIN },
    );
    tauriDriver.on("error", (e) => {
      console.error(
        `\ntauri-driver failed to start (${e.message}).\n` +
          `  - install it:  cargo install tauri-driver --locked\n` +
          `  - native driver expected: ${nativeDriver}\n`,
      );
    });
  },
  afterSession: () => {
    tauriDriver?.kill();
  },
};
