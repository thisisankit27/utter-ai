import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("renders, no console errors, no horizontal overflow", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, "no horizontal scroll").toBeLessThanOrEqual(1);

  // GitHub API calls are allowed to fail offline; ignore those.
  expect(errors.filter((e) => !/api\.github\.com|Failed to fetch|downloads\.json/.test(e))).toEqual([]);
});

test("primary navigation and anchors work", async ({ page }) => {
  await page.goto("/");
  const toggle = page.locator("#nav-toggle");
  for (const name of [/how it works/i, /formats/i, /faq/i]) {
    if (await toggle.isVisible()) await toggle.click();
    await page.getByRole("link", { name }).first().click();
    await page.waitForTimeout(350);
  }
  await expect(page.locator("#faq")).toBeInViewport({ ratio: 0.03 });
});

test("download section points at real release artifacts", async ({ page }) => {
  await page.goto("/#download");
  await expect(page.locator("#download")).toBeInViewport({ ratio: 0.02 });
  const links = page.locator('#download .opts a');
  await expect(links).toHaveCount(4);
  for (const l of await links.all()) {
    const href = await l.getAttribute("href");
    expect(href).toMatch(/github\.com\/thisisankit27\/utter-ai\/releases/);
  }
});

test("download counter renders something real (never a fake number)", async ({
  page,
}) => {
  await page.goto("/");
  const count = page.locator("#dl-count");
  await expect(count).toBeVisible();
  const text = (await count.textContent())?.trim() ?? "";
  // Either a real number/k-abbrev from GitHub, or the honest "Free" fallback.
  expect(text).toMatch(/^(\d[\d.,]*k?|Free|—)$/);
});

test("no critical accessibility violations", async ({ page }) => {
  await page.goto("/");
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  const critical = results.violations.filter(
    (v) => v.impact === "critical" || v.impact === "serious",
  );
  expect(critical.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
});
