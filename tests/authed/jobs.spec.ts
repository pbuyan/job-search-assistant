import { expect, test } from "@playwright/test";

test.describe("add a job form", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/en/jobs");
    await page.getByRole("link", { name: "Add a job" }).click();
    await expect(page).toHaveURL(/\/en\/jobs\/new$/);
  });

  test("enables submit only once there is input", async ({ page }) => {
    const submit = page.getByRole("button", { name: "Add job" });
    await expect(submit).toBeDisabled();

    await page.getByLabel("Posting URL").fill("https://example.com/job");
    await expect(submit).toBeEnabled();

    // Each tab has its own requirement.
    await page.getByRole("tab", { name: "Paste text" }).click();
    await expect(submit).toBeDisabled();
    await page.getByLabel("Job description").fill("Backend engineer");
    await expect(submit).toBeEnabled();
    // The link carries over to the paste tab as an optional reference.
    await expect(page.getByLabel("Link to the posting (optional)")).toHaveValue(
      "https://example.com/job",
    );
  });

  // Fails before any AI call: these are rejected by input/fetch validation.
  test("rejects a non-http link", async ({ page }) => {
    await page.getByLabel("Posting URL").fill("ftp://example.com/job");
    await page.getByRole("button", { name: "Add job" }).click();
    await expect(page.getByRole("alert")).toHaveText(
      "Enter a full http:// or https:// link.",
    );
  });

  test("refuses LinkedIn links", async ({ page }) => {
    await page
      .getByLabel("Posting URL")
      .fill("https://www.linkedin.com/jobs/view/1234567890");
    await page.getByRole("button", { name: "Add job" }).click();
    await expect(page.getByRole("alert")).toHaveText(
      "This site doesn't allow automated access. Copy the job description and paste it instead.",
    );
  });

  test("rejects a paste that is too short", async ({ page }) => {
    await page.getByRole("tab", { name: "Paste text" }).click();
    await page.getByLabel("Job description").fill("Backend engineer");
    await page.getByRole("button", { name: "Add job" }).click();
    await expect(page.getByRole("alert")).toHaveText(
      "That's too short to be a job description. Paste the full posting.",
    );
  });
});
