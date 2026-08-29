/**
 * Real end-to-end run of the packaged UtterAI binary via tauri-driver.
 *
 * The app auto-loads `UTTERAI_E2E_FILE` on boot (see the `e2e_autoload`
 * command), so we exercise the genuine probe → extract → whisper → transcript
 * path with the bundled ffmpeg sidecar and the built-in model.
 */
import { browser, expect, $ } from "@wdio/globals";

describe("UtterAI packaged app", () => {
  it("launches and renders", async () => {
    await browser.waitUntil(
      async () => (await $("body").getText()).length > 0,
      { timeout: 20000, timeoutMsg: "app never rendered" },
    );
    // Fresh data dir → onboarding overlay. Dismiss it.
    const skip = await $("button*=Skip");
    if (await skip.isExisting()) await skip.click();
  });

  it("transcribes the auto-loaded fixture end to end", async () => {
    // Review screen (auto-loaded via e2e_autoload)
    const start = await $("button*=Start transcription");
    await start.waitForClickable({ timeout: 30000 });
    await start.click();

    // Working screen — appears unless the clip transcribes faster than we poll.
    await browser.waitUntil(
      async () => {
        const body = (await $("body").getText()).toLowerCase();
        return body.includes("cancel transcription") || body.includes("readable");
      },
      { timeout: 20000, timeoutMsg: "never reached working or transcript screen" },
    );

    // Transcript screen — real Whisper output from the bundled model.
    // Whisper competes with the driver + webkit + xvfb for CPU here, so allow
    // generous headroom for a 4-second clip.
    try {
      await $("*=Readable").then((el) => el.waitForDisplayed({ timeout: 300000 }));
    } catch (e) {
      await browser.saveScreenshot("./tests/artifacts/app-e2e-stuck.png");
      console.log("STUCK BODY:", (await $("body").getText()).slice(0, 600));
      throw e;
    }

    const body = await $("body").getText();
    expect(body.toLowerCase()).toMatch(/fellow|americans|ask|country|so,/);

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
