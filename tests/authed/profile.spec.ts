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
  await expect(page.getByRole("status")).toHaveText("Profile saved.");
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
  await expect(page.getByRole("status")).not.toHaveText("Profile saved.");
});
