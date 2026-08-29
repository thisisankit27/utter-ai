/**
 * Real end-to-end run of the packaged UtterAI binary via tauri-driver.
 *
 * The app auto-loads `UTTERAI_E2E_FILE` on boot (see the `e2e_autoload`
 * command), so we exercise the genuine probe → extract → whisper → transcript
 * path with the bundled ffmpeg sidecar and the built-in model.
 */
import { browser, expect, $ } from "@wdio/globals";

describe("UtterAI packaged app", () => {
  it("launches and shows the intake screen", async () => {
    await browser.waitUntil(
      async () => (await $("body").getText()).length > 0,
      { timeout: 20000, timeoutMsg: "app never rendered" },
    );
  });

  it("transcribes the auto-loaded fixture end to end", async () => {
    // Review screen (auto-loaded via e2e_autoload)
    const start = await $("button*=Start transcription");
    await start.waitForDisplayed({ timeout: 30000 });
    await start.click();

    // Working screen
    await expect($("button*=Cancel transcription")).toBeDisplayed();

    // Transcript screen — real Whisper output from the bundled model
    const readable = await $("*=Readable");
    await readable.waitForDisplayed({ timeout: 180000 });

    const body = await $("body").getText();
    expect(body.toLowerCase()).toMatch(/country|fellow|ask|americans/);

    // Timestamped view renders times
    await (await $("*=Timestamped")).click();
    await expect($("body")).toHaveText(/\d+:\d\d/);

    // Export menu opens with the formats
    await (await $("button*=Export")).click();
    await expect($("*=SubRip")).toBeDisplayed();

    await browser.saveScreenshot("./tests/artifacts/app-e2e-transcript.png");
  });

  it("can start another transcription", async () => {
    await (await $("button*=New transcription")).click();
    await expect($("h1*=Turn anything spoken into text")).toBeDisplayed();
  });
});
