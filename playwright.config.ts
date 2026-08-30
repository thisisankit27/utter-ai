import { defineConfig, devices } from "@playwright/test";

/**
 * Two suites:
 *  - "app": the React UI running in a browser against the mock backend
 *    (VITE_UTTERAI_MOCK=1). Exercises the whole intake → transcript flow.
 *  - "site": the static landing page.
 */
export default defineConfig({
  testDir: "tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { trace: "on-first-retry" },

  projects: [
    {
      name: "app",
      testDir: "tests/e2e-app",
      use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:1420" },
    },
    {
      name: "site-desktop",
      testDir: "tests/e2e-site",
      use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:4173" },
    },
    {
      name: "site-mobile",
      testDir: "tests/e2e-site",
      use: { ...devices["Pixel 7"], baseURL: "http://localhost:4173" },
    },
  ],

  webServer: [
    {
      command: "npm run dev",
      url: "http://localhost:1420",
      reuseExistingServer: !process.env.CI,
      env: { VITE_UTTERAI_MOCK: "1" },
      timeout: 60_000,
    },
    {
      // Match GitHub Pages: serve the files as they are. `-s` (SPA) used to
      // send every unknown path to index.html, and serve's default clean-URLs
      // 301 /download.html to /download *and drop the query string* — between
      // them the download page could not be tested at all.
      command: "npx serve site -l 4173 -c ../tests/serve.json",
      url: "http://localhost:4173",
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
});
