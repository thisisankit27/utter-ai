import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Accessibility cover for the app shell.
 *
 * Two things are guarded here. First, contrast: `--faint` sat at 2.7:1 and it
 * carries real information — timestamps, file sizes, free disk space, form
 * hints — so axe flagged every screen. Second, keyboard reach: the range
 * ribbon claimed `role="slider"` with no tabindex and no key handling, the
 * segmented control put every option in the tab order with no arrow keys, and
 * the first-run overlay was a bare div that Tab could escape.
 */

const BASE = {
  default_model: "base",
  default_language: "auto",
  default_export_format: "txt",
  developer_mode: false,
  follow_playback: true,
  auto_update_check: true,
};

function withSettings(page: Page, extra: Record<string, unknown>) {
  return page.addInitScript(
    (s) => localStorage.setItem("utterai-mock-settings", JSON.stringify(s)),
    { ...BASE, theme: "light", onboarding_complete: true, ...extra },
  );
}

async function scan(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  return results.violations
    .filter((v) => v.impact === "critical" || v.impact === "serious")
    .map((v) => `${v.id}: ${v.help}`);
}

for (const theme of ["light", "dark"] as const) {
  test(`no serious accessibility violations end to end (${theme})`, async ({
    page,
  }) => {
    await withSettings(page, { theme });
    await page.goto("/?file=/demo/interview.mp3");
    expect(await scan(page), "intake").toEqual([]);

    await page.getByRole("button", { name: /choose an audio or video file/i }).click();
    await expect(page.getByRole("heading", { name: "interview.mp3" })).toBeVisible();
    expect(await scan(page), "review").toEqual([]);

    await page.getByRole("radio", { name: "Choose a range" }).click();
    expect(await scan(page), "review / range").toEqual([]);

    await page.getByRole("radio", { name: "Whole file" }).click();
    await page.getByRole("button", { name: /start transcription/i }).click();
    await expect(
      page.getByRole("button", { name: /new transcription/i }),
    ).toBeVisible({ timeout: 30_000 });
    expect(await scan(page), "transcript").toEqual([]);
  });
}

test("the range ribbon can be driven from the keyboard", async ({ page }) => {
  await withSettings(page, {});
  await page.goto("/?file=/demo/interview.mp3");
  await page.getByRole("button", { name: /choose an audio or video file/i }).click();
  await page.getByRole("radio", { name: "Choose a range" }).click();

  const ribbon = page.getByRole("slider");
  await expect(ribbon).toHaveAttribute("tabindex", "0");

  const start = page.getByLabel(/start time/i);
  const before = await start.inputValue();
  await ribbon.focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(start).not.toHaveValue(before);

  // "]" switches the arrows to the end handle.
  const end = page.getByLabel(/end time/i);
  const endBefore = await end.inputValue();
  await page.keyboard.press("]");
  await page.keyboard.press("ArrowRight");
  await expect(end).not.toHaveValue(endBefore);
});

test("the segmented control is one tab stop with arrow-key selection", async ({
  page,
}) => {
  await withSettings(page, {});
  await page.goto("/?file=/demo/interview.mp3");
  await page.getByRole("button", { name: /choose an audio or video file/i }).click();
  await expect(page.getByRole("radio", { name: "Whole file" })).toBeVisible();

  const tabindexes = await page
    .getByRole("radio")
    .evaluateAll((els) => els.map((e) => e.getAttribute("tabindex")));
  expect(tabindexes.filter((t) => t === "0")).toHaveLength(1);

  await page.getByRole("radio", { name: "Whole file" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("radio", { name: "Choose a range" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  // Selection and focus travel together.
  await expect(page.getByRole("radio", { name: "Choose a range" })).toBeFocused();
});

test("first run is a real dialog that keeps focus", async ({ page }) => {
  await withSettings(page, { onboarding_complete: false });
  await page.goto("/");

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  // Focus starts on the primary action, not on whatever markup came first.
  await expect(page.getByRole("button", { name: "Next" })).toBeFocused();

  for (let i = 0; i < 8; i++) {
    await page.keyboard.press("Tab");
    expect(
      await dialog.evaluate((d) => d.contains(document.activeElement)),
      `Tab ${i + 1} escaped the dialog`,
    ).toBe(true);
  }
});
