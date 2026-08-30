import { test, expect, type Page, type Locator } from "@playwright/test";

/**
 * These assert that state the UI claims to show is actually painted.
 *
 * Tailwind silently drops an opacity modifier that isn't in its scale, so
 * `bg-iris/8`, `bg-amber/8` and `opacity-45` produced no CSS at all: the active
 * transcript line, the search highlight and every disabled button rendered
 * exactly like their inactive counterparts. Nothing errored, and a test that
 * only checked class names would have passed throughout. So check the computed
 * pixels instead.
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

/** True when the element paints a background of its own. */
function hasBackground(el: Locator) {
  return el.evaluate((n) => {
    const bg = getComputedStyle(n as HTMLElement).backgroundColor;
    const m = bg.match(/rgba?\(([^)]+)\)/);
    if (!m) return false;
    const parts = m[1].split(",").map((v) => parseFloat(v));
    return parts.length < 4 || parts[3] > 0.01;
  });
}

async function toTranscript(page: Page) {
  await page.goto("/?file=/demo/interview.mp3");
  await page.getByRole("button", { name: /choose an audio or video file/i }).click();
  await page.getByRole("button", { name: /start transcription/i }).click();
  // Wait for a control unique to the transcript screen. The filename heading is
  // not one: Review shows it too, and it lingers through the exit animation, so
  // waiting on it can resolve while the app is still two screens back.
  await expect(page.getByRole("button", { name: /new transcription/i })).toBeVisible({
    timeout: 30_000,
  });
}

test("a search match is actually highlighted", async ({ page }) => {
  await toTranscript(page);

  await page.getByPlaceholder(/search/i).fill("council");
  await expect(page.locator("mark").first()).toBeVisible();

  // The row containing the match — whichever it is in the current grouping.
  const matched = page.locator('[data-row]').filter({ has: page.locator("mark") }).first();
  await expect(matched).toBeVisible();
  expect(
    await hasBackground(matched),
    "a matched row must paint a highlight",
  ).toBe(true);
  expect(
    await hasBackground(page.locator("mark").first()),
    "the matched words themselves must be marked",
  ).toBe(true);
});

test("the active line is actually highlighted during playback", async ({
  page,
}) => {
  await toTranscript(page);
  const play = page.getByRole("button", { name: "Play", exact: true });
  await expect(play).toBeEnabled();
  await page.waitForTimeout(400); // let the screen transition settle
  await play.click();

  // The playhead sits inside the first row's window from the moment it starts.
  const row = page.locator('[data-row="0"]');
  await expect.poll(() => hasBackground(row), { timeout: 10_000 }).toBe(true);
});

test("a disabled button is visibly dimmed", async ({ page }) => {
  await page.goto("/?file=/demo/interview.mp3");
  await page.getByRole("button", { name: /choose an audio or video file/i }).click();
  await page.getByLabel("Transcription model").selectOption("large-v3-turbo");

  const start = page.getByRole("button", { name: /start transcription/i });
  await expect(start).toBeDisabled();

  // `.btn` transitions all properties over 150ms, so read it until it settles
  // rather than catching it on its way down from 1.
  await expect
    .poll(
      () =>
        start.evaluate((n) =>
          parseFloat(getComputedStyle(n as HTMLElement).opacity),
        ),
      {
        message: "a disabled button that renders at full opacity looks clickable",
      },
    )
    .toBeLessThan(0.9);
});

test("the update banner paints its own background", async ({ page }) => {
  await page.goto("/?mockUpdate=1");
  const banner = page.getByRole("button", { name: /update now/i }).locator("..");
  await expect(banner).toBeVisible({ timeout: 10_000 });
  expect(await hasBackground(banner)).toBe(true);
});
