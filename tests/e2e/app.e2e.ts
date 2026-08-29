/**
 * Real end-to-end run of the packaged UtterAI binary via tauri-driver.
 *
 * The app auto-loads a media path from a sentinel file on boot (see the
 * `e2e_autoload` command), so this exercises the genuine
 * probe → extract → whisper → transcript path with the bundled ffmpeg
 * sidecar and the built-in model — no native file dialog.
 */
import { browser, expect, $ } from "@wdio/globals";

const body = () => $("body").getText();

describe("UtterAI packaged app", () => {
  it("launches and reaches the review screen for the loaded file", async () => {
    await browser.waitUntil(async () => (await body()).length > 0, {
      timeout: 20000,
      timeoutMsg: "app never rendered",
    });
    // Fresh data dir → first-run onboarding. Dismiss it.
    const skip = await $("button*=Skip");
    if (await skip.isExisting()) await skip.click();

    await browser.waitUntil(
      async () => (await body()).includes("Start transcription"),
      { timeout: 30000, timeoutMsg: "review screen never appeared" },
    );
  });

  it("transcribes the file and renders the transcript", async () => {
    await (await $("button*=Start transcription")).click();

    // The transcript text itself is the product outcome — wait for it directly
    // rather than a fragile tab selector.
    await browser.waitUntil(
      async () => /what your country can do for you/i.test(await body()),
      { timeout: 240000, timeoutMsg: "transcript never rendered" },
    );

    const text = (await body()).toLowerCase();
    expect(text).toContain("readable");
    expect(text).toContain("timestamped");
    expect(text).toMatch(/ask (not )?what your country can do for you/);

    // Timestamped view shows times.
    await (await $("button*=Timestamped")).click();
    await expect($("body")).toHaveText(/\d+:\d\d/);

    // Export menu lists the formats.
    await (await $("button*=Export")).click();
    await expect($("body")).toHaveText(/Subtitles|SubRip|\.srt/i);

    await browser.saveScreenshot("./tests/artifacts/app-e2e-transcript.png");
  });

  it("can start another transcription", async () => {
    await (await $("button*=New transcription")).click();
    await browser.waitUntil(
      async () => (await body()).includes("Turn anything spoken into text"),
      { timeout: 15000, timeoutMsg: "did not return to the intake screen" },
    );
  });
});
