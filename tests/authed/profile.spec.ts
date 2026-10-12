import { expect, test } from "@playwright/test";

// Overwrites the test user's master profile. Use a dedicated Clerk user.
test.describe.configure({ mode: "serial" });

test("edits, saves and reloads the master profile", async ({ page }) => {
  const stamp = Date.now();
  const name = `E2E Tester ${stamp}`;

  await page.goto("/en/profile");
  const save = page.getByRole("button", { name: "Save profile" });

  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("Headline").fill("Senior Software Engineer");
  await page.getByLabel("Email").fill("e2e@example.com");

  // Replace any experience from earlier runs with one known position.
  const removeWork = page.getByRole("button", { name: /^Remove position \d+$/ });
  while ((await removeWork.count()) > 0) await removeWork.first().click();

  await page.getByRole("button", { name: "Add position" }).click();
  await page.getByLabel("Company").fill("Acme Corp");
  await page.getByLabel("Job title").fill("Software Engineer");
  await page.getByLabel("Start date").fill("2020-01");
  await page.getByRole("button", { name: "Add achievement" }).click();
  await page
    .getByLabel("Achievement 1")
    .fill("Cut checkout latency by 40% by moving pricing to an edge cache");

  await expect(save).toBeEnabled();
  await save.click();
  await expect(page.getByRole("status")).toHaveText("Profile saved.");
  // Saved form is clean again, so Save is disabled until the next edit.
  await expect(save).toBeDisabled();

  await page.reload();
  await expect(page.getByLabel("Full name")).toHaveValue(name);
  await expect(page.getByLabel("Company")).toHaveValue("Acme Corp");
  await expect(page.getByLabel("Achievement 1")).toHaveValue(
    "Cut checkout latency by 40% by moving pricing to an edge cache",
  );
});

test("blocks saving an invalid profile", async ({ page }) => {
  await page.goto("/en/profile");
  await page.getByLabel("Full name").fill("");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByLabel("Full name")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(page.getByRole("status")).not.toHaveText("Profile saved.");
});
