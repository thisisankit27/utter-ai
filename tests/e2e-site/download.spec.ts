import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * The download / thank-you page.
 *
 * The thing worth protecting here is honesty: every file name, size and hash on
 * this page comes from the release itself, so the tests check that what's shown
 * matches checksums.json rather than asserting hard-coded strings that would
 * quietly go stale at the next release.
 */

/** Stop the test from actually pulling ~150MB of installer. */
async function stubDownloads(page: Page) {
  await page.route(/releases\/download\//, (r) =>
    r.fulfill({
      status: 200,
      headers: { "content-disposition": "attachment; filename=stub.bin" },
      body: "stub",
    }),
  );
}

async function snapshot(page: Page) {
  return page.evaluate(() => fetch("checksums.json").then((r) => r.json()));
}

const VARIANTS: [string, RegExp][] = [
  ["windows", /-setup\.exe$/],
  ["msi", /\.msi$/],
  ["deb", /\.deb$/],
  ["appimage", /\.AppImage$/],
];

for (const [param, pattern] of VARIANTS) {
  test(`?p=${param} shows that artifact's real name and checksum`, async ({
    page,
  }) => {
    await stubDownloads(page);
    await page.goto(`/download.html?p=${param}`);

    const name = page.locator("#dl-name");
    await expect(name).not.toHaveText(/Preparing/, { timeout: 15_000 });

    const shown = (await name.textContent())!.trim();
    expect(shown, `expected a ${pattern} artifact`).toMatch(pattern);

    const data = await snapshot(page);
    const entry = data.files.find((f: { name: string }) => f.name === shown);
    expect(entry, `${shown} is not in checksums.json`).toBeTruthy();

    // The hash on screen must be the one from the release, character for
    // character — not a placeholder and not a stale copy.
    await expect(page.locator("#hash-value")).toHaveText(entry.sha256);
    await expect(page.locator("#hash-value")).toHaveText(/^[0-9a-f]{64}$/);

    // And there must be install guidance, not just a file.
    expect(await page.locator("#install-steps li").count()).toBeGreaterThan(2);
  });
}

test("the download starts on its own and can be retriggered", async ({ page }) => {
  const asked: string[] = [];
  await page.route(/releases\/download\//, (r) => {
    asked.push(r.request().url());
    return r.fulfill({
      status: 200,
      headers: { "content-disposition": "attachment; filename=stub.bin" },
      body: "stub",
    });
  });

  await page.goto("/download.html?p=deb");
  await expect.poll(() => asked.length, { timeout: 15_000 }).toBe(1);
  expect(asked[0]).toMatch(/\.deb$/);

  // The page must still be here — a failed download must never replace it.
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: /download again/i })).toBeVisible();
});

test("switching platform re-renders without starting another download", async ({
  page,
}) => {
  let downloads = 0;
  await page.route(/releases\/download\//, (r) => {
    downloads++;
    return r.fulfill({
      status: 200,
      headers: { "content-disposition": "attachment; filename=stub.bin" },
      body: "stub",
    });
  });

  await page.goto("/download.html?p=windows");
  await expect.poll(() => downloads, { timeout: 15_000 }).toBe(1);

  await page.getByRole("link", { name: /debian/i }).click();
  await expect(page.locator("#dl-name")).toHaveText(/\.deb$/);
  await page.waitForTimeout(1200);
  expect(downloads, "changing platform must not auto-download again").toBe(1);
});

test("with the release API unreachable it degrades honestly", async ({ page }) => {
  await stubDownloads(page);
  await page.route(/api\.github\.com/, (r) => r.abort());
  await page.goto("/download.html?p=windows");

  // Falls back to the committed snapshot; still a real name and a real hash.
  await expect(page.locator("#dl-name")).not.toHaveText(/Preparing/, {
    timeout: 15_000,
  });
  await expect(page.locator("#dl-name")).toHaveText(/-setup\.exe$/);
  await expect(page.locator("#hash-value")).toHaveText(/^[0-9a-f]{64}$/);
});

test("with no release data at all it points at the releases page", async ({
  page,
}) => {
  await stubDownloads(page);
  await page.route(/api\.github\.com/, (r) => r.abort());
  await page.route(/checksums\.json/, (r) => r.fulfill({ status: 404, body: "" }));
  await page.goto("/download.html?p=windows");

  // No invented file name, no invented hash — just a link that always works.
  await expect(page.locator("#verify")).toBeHidden();
  const link = page.getByRole("link", { name: /go to downloads/i });
  await expect(link).toBeVisible({ timeout: 15_000 });
  await expect(link).toHaveAttribute("href", /github\.com\/.*\/releases/);
});

test("no console errors, no horizontal overflow", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await stubDownloads(page);

  await page.goto("/download.html?p=deb");
  await page.waitForTimeout(2000);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);

  // The GitHub API 403s once the anonymous rate limit is reached and 404s
  // before the first release; both are handled by the snapshot fallback, and
  // the browser logs them without naming the URL.
  const ignorable =
    /api\.github\.com|Failed to fetch|net::ERR|status of (403|404|429)/;
  expect(errors.filter((e) => !ignorable.test(e))).toEqual([]);
});

test("no critical accessibility violations", async ({ page }) => {
  await stubDownloads(page);
  await page.goto("/download.html?p=windows");
  await page.waitForTimeout(1500);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  const critical = results.violations.filter(
    (v) => v.impact === "critical" || v.impact === "serious",
  );
  expect(critical.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
});
