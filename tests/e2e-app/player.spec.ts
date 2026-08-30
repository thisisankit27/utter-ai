import { test, expect, type Page } from "@playwright/test";

/**
 * Regression cover for the media player.
 *
 * The bug these guard against: the screens flipped their own `playing` boolean
 * on click, so the button showed "Pause" even when `play()` had rejected and
 * nothing was playing. State now comes from the element's own events, so the
 * invariant worth asserting is simply: the button and the element always agree.
 */

const SETTINGS = {
  default_model: "base",
  default_language: "auto",
  default_export_format: "txt",
  theme: "light",
  developer_mode: false,
  onboarding_complete: true,
  follow_playback: true,
  auto_update_check: true,
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript((s) => {
    localStorage.setItem("utterai-mock-settings", JSON.stringify(s));
    localStorage.removeItem("utterai-mock-history");
  }, SETTINGS);
});

/** The `<video>` element's own view of the world. */
function elementState(page: Page) {
  return page.evaluate(() => {
    const v = document.querySelector("video");
    return v
      ? { present: true, paused: v.paused, time: v.currentTime, error: v.error?.code ?? null }
      : { present: false, paused: true, time: 0, error: null };
  });
}

async function openReview(page: Page, file = "/demo/interview.mp3") {
  await page.goto(`/?file=${file}`);
  await page.getByRole("button", { name: /choose an audio or video file/i }).click();
  await expect(page.getByRole("heading", { name: file.split("/").pop()! })).toBeVisible();
}

test("play button state always matches the element", async ({ page }) => {
  await openReview(page);
  const btn = page.getByRole("button", { name: /play preview|pause preview/i });

  await expect(btn).toHaveAttribute("aria-label", "Play preview");
  expect((await elementState(page)).paused).toBe(true);

  await btn.click();
  await expect(btn).toHaveAttribute("aria-label", "Pause preview");
  await expect.poll(async () => (await elementState(page)).paused).toBe(false);

  await btn.click();
  await expect(btn).toHaveAttribute("aria-label", "Play preview");
  await expect.poll(async () => (await elementState(page)).paused).toBe(true);
});

test("repeated play/pause never desyncs the button from the element", async ({
  page,
}) => {
  await openReview(page);
  const btn = page.getByRole("button", { name: /play preview|pause preview/i });

  for (let i = 0; i < 8; i++) {
    await btn.click();
    await page.waitForTimeout(120);
    const label = await btn.getAttribute("aria-label");
    const el = await elementState(page);
    expect(
      label === "Pause preview" ? !el.paused : el.paused,
      `iteration ${i}: button said "${label}" but element.paused=${el.paused}`,
    ).toBe(true);
  }
});

test("an unplayable file disables the control and says so, instead of lying", async ({
  page,
}) => {
  // `nomedia` makes the mock hand back an empty source, standing in for a codec
  // the webview can't decode or a file that has moved.
  await openReview(page, "/demo/nomedia-clip.mp3");
  const btn = page.getByRole("button", { name: /play preview/i });

  await expect(btn).toBeDisabled();
  await expect(page.getByText(/no media file|can't be previewed/i)).toBeVisible();
  // No element at all, rather than a <video src=""> resolving to the page URL.
  expect((await elementState(page)).present).toBe(false);
  // And the label must not have flipped.
  await expect(btn).toHaveAttribute("aria-label", "Play preview");
});

test("switching files resets the player and the range mode", async ({ page }) => {
  await openReview(page, "/demo/first.mp3");
  await page.getByRole("radio", { name: "Choose a range" }).click();
  await page.getByRole("button", { name: /play preview/i }).click();
  await expect.poll(async () => (await elementState(page)).paused).toBe(false);

  await page.getByRole("button", { name: /choose a different file/i }).click();
  await page.evaluate(() => history.replaceState(null, "", "/?file=/demo/second.mp3"));
  await page.getByRole("button", { name: /choose an audio or video file/i }).click();
  await expect(page.getByRole("heading", { name: "second.mp3" })).toBeVisible();

  // Nothing from the previous file survives.
  await expect(page.getByRole("radio", { name: "Whole file" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(
    page.getByRole("button", { name: /play preview/i }),
  ).toBeVisible();
  expect((await elementState(page)).paused).toBe(true);
});

test("seeking from the transcript moves the playhead", async ({ page }) => {
  await openReview(page);
  await page.getByRole("button", { name: /start transcription/i }).click();
  await expect(page.getByRole("heading", { name: "interview.mp3" })).toBeVisible({
    timeout: 30_000,
  });

  // Click a later line; the element should follow, even though it was never
  // played (the old code set currentTime before metadata and silently lost it).
  await page.locator('[data-row="1"]').click();
  await expect.poll(async () => (await elementState(page)).time).toBeGreaterThan(0);
});
