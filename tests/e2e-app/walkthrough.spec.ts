import { test, expect } from "@playwright/test";

// The mock backend (VITE_UTTERAI_MOCK=1) plays a canned JFK transcript through
// the real command/event contract, so this drives the whole UI flow.

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem(
        "utterai-mock-settings",
        JSON.stringify({
          default_model: "base",
          default_language: "auto",
          default_export_format: "txt",
          theme: "light",
          developer_mode: false,
          onboarding_complete: true,
          follow_playback: true,
        }),
      );
      localStorage.removeItem("utterai-mock-history");
    } catch {
      /* ignore */
    }
  });
});

test("full journey: intake → range → transcribe → transcript → export", async ({
  page,
}) => {
  await page.goto("/?file=/demo/ask-not.mp3");

  await expect(
    page.getByRole("heading", { name: /turn anything spoken into text/i }),
  ).toBeVisible();

  await page.getByRole("button", { name: /choose an audio or video file/i }).click();

  // Review screen
  await expect(page.getByRole("heading", { name: "ask-not.mp3" })).toBeVisible();
  await expect(page.getByText(/will transcribe/i)).toBeVisible();

  // choose a range
  await page.getByRole("radio", { name: "Choose a range" }).click();
  await expect(page.getByRole("slider", { name: /transcription range/i })).toBeVisible();

  // back to whole file, then start
  await page.getByRole("radio", { name: "Whole file" }).click();
  await page.getByRole("button", { name: /start transcription/i }).click();

  // Working screen — real staged progress
  await expect(page.getByText(/preparing the audio|checking the file/i)).toBeVisible();
  await expect(page.getByText(/live preview/i)).toBeVisible({ timeout: 15_000 });

  // Transcript screen
  await expect(page.getByRole("heading", { name: "ask-not.mp3" })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText(/ask what you can do for your country/i)).toBeVisible();

  // timestamped view
  await page.getByRole("radio", { name: "Timestamped" }).click();
  await expect(page.locator("text=/00:0[0-9]/").first()).toBeVisible();

  // search
  await page.getByPlaceholder(/search/i).fill("country");
  await expect(page.getByText(/\d+ found/i)).toBeVisible();

  // export menu opens and lists formats
  await page.getByRole("button", { name: /export/i }).click();
  await expect(page.getByRole("menuitem", { name: /subtitles \(\.srt\)/i })).toBeVisible();
  await page.getByRole("menuitem", { name: /plain text/i }).click();
  await expect(page.getByText(/transcript exported/i)).toBeVisible();

  // start another
  await page.getByRole("button", { name: /new transcription/i }).click();
  await expect(
    page.getByRole("heading", { name: /turn anything spoken into text/i }),
  ).toBeVisible();
});

test("corrupt file shows a friendly error, not an exception", async ({ page }) => {
  await page.goto("/?file=/demo/broken-recording.mp3");
  await page.getByRole("button", { name: /choose an audio or video file/i }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/this file looks damaged/i)).toBeVisible();
  await expect(dialog.getByText(/panic|unwrap|Error:/)).toHaveCount(0);
  await dialog.getByRole("button", { name: /got it/i }).click();
});

test("history records a finished transcript", async ({ page }) => {
  await page.goto("/?file=/demo/lecture.mp3");
  await page.getByRole("button", { name: /choose an audio or video file/i }).click();
  await page.getByRole("button", { name: /start transcription/i }).click();
  await expect(page.getByText(/ask what you can do/i)).toBeVisible({ timeout: 20_000 });

  await page.getByRole("button", { name: "History" }).click();
  await expect(page.getByRole("heading", { name: "History" })).toBeVisible();
  await expect(page.getByText("lecture.mp3")).toBeVisible();
});
