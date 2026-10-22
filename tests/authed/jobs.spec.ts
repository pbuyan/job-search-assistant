import { expect, test, type Page } from "@playwright/test";
import { gotoSignedIn } from "../support";

test.describe("add a job form", () => {
  // Scoped to main: Next's route announcer is also role="alert".
  const formError = (page: Page) => page.getByRole("main").getByRole("alert");

  test.beforeEach(async ({ page }) => {
    await gotoSignedIn(page, "/en/jobs");
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
    await expect(formError(page)).toHaveText(
      "Enter a full http:// or https:// link.",
    );
  });

  test("refuses LinkedIn links", async ({ page }) => {
    await page
      .getByLabel("Posting URL")
      .fill("https://www.linkedin.com/jobs/view/1234567890");
    await page.getByRole("button", { name: "Add job" }).click();
    await expect(formError(page)).toHaveText(
      "This site doesn't allow automated access. Copy the job description and paste it instead.",
    );
  });

  test("rejects a paste that is too short", async ({ page }) => {
    await page.getByRole("tab", { name: "Paste text" }).click();
    await page.getByLabel("Job description").fill("Backend engineer");
    await page.getByRole("button", { name: "Add job" }).click();
    await expect(formError(page)).toHaveText(
      "That's too short to be a job description. Paste the full posting.",
    );
  });
});

// Read-only: works whether or not the test user has jobs, because filters
// in the URL always show the filter bar.
test("jobs list keeps sort and filters in the URL", async ({ page }) => {
  await gotoSignedIn(page, "/en/jobs?sort=fit&remote=remote&analyzed=bogus");
  await expect(page.getByRole("combobox", { name: "Sort by" })).toContainText(
    "Fit score",
  );
  await expect(
    page.getByRole("combobox", { name: "Work model" }),
  ).toContainText("Remote");
  // An unknown value falls back to no filter.
  await expect(
    page.getByRole("combobox", { name: "Fit analysis" }),
  ).toContainText("Any");

  await page.getByLabel("Location").fill("Toronto");
  await page.getByLabel("Location").press("Enter");
  await expect(page).toHaveURL(/location=Toronto/);
  await expect(page).toHaveURL(/sort=fit/);

  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page).toHaveURL(/\/en\/jobs\?sort=fit$/);
  await expect(page.getByLabel("Location")).toHaveValue("");
});

// No network: the link is rejected before any board API is called.
test("job board page rejects links that aren't Greenhouse, Lever or Ashby", async ({
  page,
}) => {
  await gotoSignedIn(page, "/en/jobs");
  await page.getByRole("link", { name: "Browse a job board" }).click();
  await expect(page).toHaveURL(/\/en\/jobs\/boards$/);
  await page
    .getByLabel("Job board link")
    .fill("https://www.linkedin.com/jobs/view/1");
  await page.getByRole("button", { name: "Show postings" }).click();
  await expect(page).toHaveURL(/url=https/);
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "That isn't a Greenhouse, Lever or Ashby job board link.",
  );
});
