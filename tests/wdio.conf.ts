import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * End-to-end walkthrough of the packaged app via tauri-driver.
 *
 * Requires: a `tauri build` at target/release/utterai (a plain `cargo build`
 * runs in dev mode and expects the vite server), `tauri-driver` on PATH, and
 * WebKitWebDriver on Linux. Run under xvfb.
 *
 * The app reads a media path from a sentinel file on boot (see the
 * `e2e_autoload` command) so the walkthrough skips the native file dialog.
 */
const ROOT = path.resolve(__dirname, "..");
const APP = process.env.UTTERAI_BIN || path.join(ROOT, "target/release/utterai");
const FIXTURE =
  process.env.UTTERAI_FIXTURE || path.join(ROOT, "fixtures/jfk.wav");
const SENTINEL =
  process.env.UTTERAI_E2E_FILE || path.join(os.tmpdir(), "utterai-e2e-autoload");

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
      throw new Error(
        `App binary not found at ${APP}. Run: npm run tauri build -- --bundles deb`,
      );
    }
    fs.mkdirSync(path.join(ROOT, "tests/artifacts"), { recursive: true });
    fs.writeFileSync(SENTINEL, FIXTURE);
  },
  onComplete: () => {
    try {
      fs.unlinkSync(SENTINEL);
    } catch {
      /* ignore */
    }
  },
  beforeSession: () => {
    const nativeDriver =
      process.env.NATIVE_DRIVER ||
      (process.platform === "win32"
        ? "msedgedriver"
        : "/usr/bin/WebKitWebDriver");
    tauriDriver = spawn(
      "tauri-driver",
      ["--port", "4444", "--native-driver", nativeDriver],
      { stdio: [null, process.stdout, process.stderr] },
    );
  },
  afterSession: () => {
    tauriDriver?.kill();
  },
};
