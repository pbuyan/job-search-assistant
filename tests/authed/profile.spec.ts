import { expect, test } from "@playwright/test";
import { gotoSignedIn } from "../support";

// Overwrites the test user's master profile. Use a dedicated Clerk user.
test.describe.configure({ mode: "serial" });

test("edits, saves and reloads the master profile", async ({ page }) => {
  const stamp = Date.now();
  const name = `E2E Tester ${stamp}`;

  await gotoSignedIn(page, "/en/profile");
  const save = page.getByRole("button", { name: "Save profile" });

  // The first edit can land mid-hydration, when the form re-applies stored
  // values to its inputs (twice in dev); retry until the new value sticks.
  const fullName = page.getByLabel("Full name");
  await expect(async () => {
    await fullName.fill(name);
    await expect(fullName).toHaveValue(name, { timeout: 1_000 });
  }).toPass();
  await page.getByLabel("Headline").fill("Senior Software Engineer");
  await page.getByLabel("Email").fill("e2e@example.com");

  // Replace any experience from earlier runs with one known position.
  const removeWork = page.getByRole("button", {
    name: /^Remove position \d+$/,
  });
  while ((await removeWork.count()) > 0) await removeWork.first().click();

  // Scoped to the work section: education entries also have date fields.
  const work = page.getByRole("region", { name: "Work experience" });
  await page.getByRole("button", { name: "Add position" }).click();
  await work.getByLabel("Company").fill("Acme Corp");
  await work.getByLabel("Job title").fill("Software Engineer");
  await work.getByLabel("Start date").fill("2020-01");
  await page.getByRole("button", { name: "Add achievement" }).click();
  await page
    .getByLabel("Achievement 1", { exact: true })
    .fill("Cut checkout latency by 40% by moving pricing to an edge cache");

  await expect(save).toBeEnabled();
  await save.click();
  // The preferences form has its own status line.
  await expect(
    page.getByRole("status").filter({ hasText: "Profile saved." }),
  ).toBeVisible();
  // Saved form is clean again, so Save is disabled until the next edit.
  await expect(save).toBeDisabled();

  await page.reload();
  await expect(page.getByLabel("Full name")).toHaveValue(name);
  await expect(work.getByLabel("Company")).toHaveValue("Acme Corp");
  await expect(page.getByLabel("Achievement 1", { exact: true })).toHaveValue(
    "Cut checkout latency by 40% by moving pricing to an edge cache",
  );
});

test("blocks saving an invalid profile", async ({ page }) => {
  await gotoSignedIn(page, "/en/profile");
  // Same hydration race as above: retry until the cleared value sticks.
  const fullName = page.getByLabel("Full name");
  await expect(async () => {
    await fullName.fill("");
    await expect(fullName).toHaveValue("", { timeout: 1_000 });
  }).toPass();
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(fullName).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText("Profile saved.")).toHaveCount(0);
});

test("saves search preferences", async ({ page }) => {
  await gotoSignedIn(page, "/en/profile");
  const titles = page.getByLabel("Target job titles (comma-separated)");
  await expect(async () => {
    await titles.fill(
      "Backend developer, Software engineer, backend developer",
    );
    await expect(titles).toHaveValue(/Software engineer/, { timeout: 1_000 });
  }).toPass();
  await page.getByLabel("Minimum yearly salary").fill("90000");
  await page.getByRole("button", { name: "Save preferences" }).click();
  // Saved either way; matching may lag if the embedding service is down.
  await expect(
    page.getByRole("status").filter({ hasText: /^Preferences saved/ }),
  ).toBeVisible({ timeout: 45_000 });

  await page.reload();
  // Split, trimmed and de-duplicated on save.
  await expect(titles).toHaveValue("Backend developer, Software engineer");
  await expect(page.getByLabel("Minimum yearly salary")).toHaveValue("90000");
});
