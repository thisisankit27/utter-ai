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

  // The GitHub API calls (counter, asset links) 404 before the first release
  // and 403 when rate-limited — both are handled gracefully in app.js.
  const ignorable =
    /api\.github\.com|Failed to fetch|downloads\.json|status of (403|404|429)/;
  expect(errors.filter((e) => !ignorable.test(e))).toEqual([]);
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

test("download section routes every platform through the download page", async ({
  page,
}) => {
  await page.goto("/#download");
  await expect(page.locator("#download")).toBeInViewport({ ratio: 0.02 });
  const links = page.locator("#download .opts a");
  await expect(links).toHaveCount(4);

  // Links go to download.html, which starts the file *and* shows the checksum
  // and install steps — a bare asset URL leaves people with a saved file and
  // no idea what to do with it.
  const hrefs = await links.evaluateAll((els) =>
    els.map((e) => e.getAttribute("href")),
  );
  expect(hrefs.sort()).toEqual([
    "download.html?p=appimage",
    "download.html?p=deb",
    "download.html?p=msi",
    "download.html?p=windows",
  ]);
});

test("the hero download button offers a real file, not just a scroll", async ({
  page,
}) => {
  await page.goto("/");
  const btn = page.locator("#primary-dl");
  await expect(btn).toBeVisible();
  const [text, href] = await Promise.all([
    btn.textContent(),
    btn.getAttribute("href"),
  ]);
  // Whatever platform the test browser reports, the label and the destination
  // have to agree. The label used to promise "Download for Windows" while the
  // link only jumped to a section further down the page.
  if (/download for/i.test(text ?? "")) {
    expect(href).toMatch(/^download\.html\?p=/);
  } else {
    expect(href).toBe("#download");
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
