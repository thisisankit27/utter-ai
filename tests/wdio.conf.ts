import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

/**
 * End-to-end walkthrough of the packaged app using tauri-driver.
 *
 * Requires: a release build at src-tauri/target/release/utterai, `tauri-driver`
 * on PATH (`cargo install tauri-driver`), and WebKitWebDriver (Linux). CI runs
 * this under xvfb.
 */
const APP =
  process.env.UTTERAI_BIN ||
  path.resolve(__dirname, "../src-tauri/target/release/utterai");

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
  mochaOpts: { ui: "bdd", timeout: 180_000 },
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
  },
  beforeSession: () => {
    tauriDriver = spawn("tauri-driver", [], {
      stdio: [null, process.stdout, process.stderr],
    });
  },
  afterSession: () => {
    tauriDriver?.kill();
  },
};

// Fail fast with a clear message if tauri-driver is missing.
if (spawnSync("tauri-driver", ["--help"]).error) {
  console.error("tauri-driver not found — install with: cargo install tauri-driver");
}
