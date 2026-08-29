import { test, expect } from "@playwright/test";

// `?mockUpdate=1` makes the mock updater report a newer version, so this
// exercises the real banner + settings flow without a second release.

test.beforeEach(async ({ page }) => {
  // Clear stored state once per test — not on in-test reloads, which must keep
  // whatever the test just saved.
  await page.addInitScript(() => {
    try {
      if (!sessionStorage.getItem("__utterai_test_init")) {
        sessionStorage.setItem("__utterai_test_init", "1");
        localStorage.removeItem("utterai-mock-settings");
        localStorage.removeItem("utterai-mock-history");
      }
    } catch {
      /* ignore */
    }
  });
});

test("an available update shows a dismissable banner and installs", async ({
  page,
}) => {
  await page.goto("/?mockUpdate=1");

  const banner = page.getByText(/UtterAI 9\.9\.9 is available/i);
  await expect(banner).toBeVisible({ timeout: 10_000 });

  // Dismiss hides it for the session.
  await page.getByRole("button", { name: /dismiss/i }).click();
  await expect(banner).toBeHidden();

  // Settings still reflects the available update.
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("menuitem", { name: /settings & models/i }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();

  await expect(page.getByText("Updates", { exact: true })).toBeVisible();
  await expect(page.getByText(/9\.9\.9 is ready to install/i)).toBeVisible();

  await page.getByRole("button", { name: /download & install/i }).click();
  await expect(
    page.getByText(/update installed — restart to finish/i),
  ).toBeVisible({ timeout: 15_000 });
});

test("automatic checks can be turned off", async ({ page }) => {
  await page.goto("/?mockUpdate=1");
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("menuitem", { name: /settings & models/i }).click();

  const toggle = page.getByRole("switch", {
    name: /check for updates automatically/i,
  });
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");

  // Persisted across a reload (give the mock write a beat to land).
  await page.waitForTimeout(300);
  await page.reload();
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("menuitem", { name: /settings & models/i }).click();
  await expect(
    page.getByRole("switch", { name: /check for updates automatically/i }),
  ).toHaveAttribute("aria-checked", "false");
});
