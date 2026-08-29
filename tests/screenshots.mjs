/**
 * Capture real UtterAI screenshots for the landing page.
 * Runs the app against the mock backend and drives it through the flow.
 *
 *   node tests/screenshots.mjs            # needs `npm run dev` (mock) on :1420
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(root, "site", "assets");
mkdirSync(OUT, { recursive: true });

const BASE = process.env.APP_URL || "http://localhost:1420";
// Match the real UtterAI window so screenshots look like the app people install.
const VIEW = { width: 1160, height: 745 };
const SETTINGS = {
  default_model: "base",
  default_language: "auto",
  default_export_format: "txt",
  theme: "dark",
  developer_mode: false,
  onboarding_complete: true,
  follow_playback: true,
};

const shot = async (page, name, opts = {}) => {
  // clear any transient toast and un-hover before capturing
  await page.evaluate(() => {
    document.querySelectorAll('[class*="pointer-events-auto"]').forEach((el) => {
      if (el.textContent && /ready|copied|exported/i.test(el.textContent)) el.remove();
    });
  });
  await page.mouse.move(4, 4);
  await page.waitForTimeout(450);
  await page.screenshot({ path: join(OUT, `${name}.png`), ...opts });
  console.log("saved", name);
};

const run = async (theme) => {
  const suffix = theme === "dark" ? "" : "-light";
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.addInitScript((s) => {
    localStorage.setItem("utterai-mock-settings", JSON.stringify(s));
    localStorage.removeItem("utterai-mock-history");
  }, { ...SETTINGS, theme });

  // Intake
  await page.goto(`${BASE}/?file=/Users/you/Recordings/city-council-interview.mp3`);
  await page.waitForSelector("text=/turn anything spoken into text/i");
  await shot(page, `shot-intake${suffix}`);

  // Review
  await page.getByRole("button", { name: /choose an audio or video file/i }).click();
  await page.getByRole("radio", { name: "Choose a range" }).click();
  await page.waitForTimeout(400);
  await shot(page, `shot-review${suffix}`);

  // Working
  await page.getByRole("radio", { name: "Whole file" }).click();
  await page.getByRole("button", { name: /start transcription/i }).click();
  await page.waitForSelector("text=/live preview/i", { timeout: 15000 });
  await page.waitForTimeout(900);
  await shot(page, `shot-working${suffix}`);

  // Transcript
  await page.waitForSelector("text=/ask what you can do for your country/i", { timeout: 20000 });
  await page.waitForTimeout(600);
  await shot(page, `shot-transcript${suffix}`);

  // Settings / model manager
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("menuitem", { name: /settings & models/i }).click();
  await page.waitForSelector("text=/transcription models/i");
  await shot(page, `shot-settings${suffix}`);

  await browser.close();
};

await run("dark");
await run("light");

// A simple OG image: reuse the transcript shot on a branded panel.
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(`
  <div style="width:1200px;height:630px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:24px;background:#0c0d10;color:#e9eaee;font-family:system-ui">
    <div style="display:flex;align-items:center;gap:16px">
      <svg width="56" height="56" viewBox="0 0 24 24">
        <defs><linearGradient id="i" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#807BFF"/><stop offset="1" stop-color="#635BF0"/></linearGradient></defs>
        <rect width="24" height="24" rx="5.6" fill="url(#i)"/>
        <g fill="#fff">
          <rect x="3.6" y="8.4" width="2.2" height="7.2" rx="1.1"/>
          <rect x="7.35" y="5.28" width="2.2" height="13.44" rx="1.1"/>
          <rect x="11.1" y="2.16" width="2.2" height="19.68" rx="1.1"/>
          <rect x="14.85" y="6.24" width="2.2" height="11.52" rx="1.1"/>
          <rect x="18.6" y="9.12" width="2.2" height="5.76" rx="1.1"/>
        </g>
      </svg>
      <span style="font-size:52px;font-weight:700;letter-spacing:-.02em">UtterAI</span>
    </div>
    <p style="font-size:30px;color:#9194a0;margin:0">Private, local audio &amp; video transcription</p>
  </div>`);
await page.screenshot({ path: join(OUT, "og.png") });
await browser.close();
console.log("saved og");
