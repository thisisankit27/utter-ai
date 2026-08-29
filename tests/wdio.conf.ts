import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * End-to-end walkthrough of the packaged app using tauri-driver.
 *
 * Requires: a release build at target/release/utterai, `tauri-driver`
 * on PATH (`cargo install tauri-driver`), and WebKitWebDriver (Linux). Run under
 * xvfb. The app auto-loads UTTERAI_E2E_FILE on boot.
 */
const ROOT = path.resolve(__dirname, "..");
const APP =
  process.env.UTTERAI_BIN || path.join(ROOT, "target/release/utterai");
const FIXTURE =
  process.env.UTTERAI_E2E_FILE || path.join(ROOT, "fixtures/jfk.wav");

let tauriDriver: ChildProcess;

export const config: WebdriverIO.Config = {
  runner: "local",
  specs: ["./e2e/**/*.e2e.ts"],
  maxInstances: 1,
  capabilities: [
    {
      // @ts-expect-error tauri-specific capability
      "tauri:options": { application: APP },
      browserName: "wry",
    },
  ],
  hostname: "127.0.0.1",
  port: 4444,
  logLevel: "warn",
  framework: "mocha",
  reporters: ["spec"],
  mochaOpts: { ui: "bdd", timeout: 240_000 },
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
    process.env.UTTERAI_E2E = "1";
    process.env.UTTERAI_E2E_FILE = FIXTURE;
  },
  beforeSession: () => {
    tauriDriver = spawn("tauri-driver", [], {
      stdio: [null, process.stdout, process.stderr],
      env: { ...process.env, UTTERAI_E2E: "1", UTTERAI_E2E_FILE: FIXTURE },
    });
  },
  afterSession: () => {
    tauriDriver?.kill();
  },
};
