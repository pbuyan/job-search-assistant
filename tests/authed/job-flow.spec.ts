import { expect, test } from "@playwright/test";
import { gotoSignedIn } from "../support";

// Full journey through the real AI pipeline (Claude + Voyage): slow and billed,
// so opt-in with E2E_AI=1. Needs the profile saved by profile.spec.ts. Each run
// ends by deleting its job and application, leaving two resume versions (an
// original and its translation) on the test user.
test.skip(!process.env.E2E_AI, "set E2E_AI=1 to run the AI flow");
test.describe.configure({ mode: "serial", timeout: 240_000 });

const POSTING = `Software Engineer, Payments — Northwind Labs (Toronto, hybrid)

Northwind Labs builds checkout infrastructure for online retailers. We are
hiring a Software Engineer to join the Payments team.

What you'll do
- Design and run services that process card and wallet payments
- Improve latency and reliability of the checkout path
- Partner with product and support on incident follow-ups

Requirements
- 3+ years of professional software engineering experience
- Strong TypeScript or Go
- Experience with Postgres and caching layers
- Experience operating production services

Nice to have
- Payments or fintech background
- Experience with edge caching or CDNs`;

test("pastes a posting, analyzes fit, tracks it, and tailors a resume", async ({
  page,
}) => {
  await gotoSignedIn(page, "/en/jobs/new");
  await page.getByRole("tab", { name: "Paste text" }).click();
  await page.getByLabel("Job description").fill(POSTING);
  await page.getByRole("button", { name: "Add job" }).click();
  await expect(
    page.getByRole("button", { name: "Reading the posting…" }),
  ).toBeVisible();

  await expect(page).toHaveURL(/\/en\/jobs\/[0-9a-f-]{36}$/, {
    timeout: 120_000,
  });
  const jobUrl = page.url();
  const title = page.getByRole("heading", { level: 1 });
  await expect(title).toContainText(/engineer/i);
  const jobTitle = (await title.textContent())!.trim();
  // Unique per run: earlier runs leave resume versions on the test user.
  const versionName = `E2E ${Date.now()}`;

  await page.getByRole("button", { name: "Analyze fit" }).click();
  // "Fit with your profile" is also the card title before analysis; the
  // re-run button only appears once a result is shown.
  await expect(
    page.getByRole("button", { name: "Re-run analysis" }),
  ).toBeVisible({ timeout: 120_000 });

  await page.getByRole("button", { name: "Track this job" }).click();
  await expect(page.getByText("In your tracker: Saved.")).toBeVisible();

  await page.getByRole("link", { name: "Open tracker" }).click();
  await expect(page).toHaveURL(/\/en\/tracker$/);
  await expect(page.getByText(jobTitle).first()).toBeVisible();

  await gotoSignedIn(page, "/en/jobs");
  await expect(
    page.locator(`a[href="${new URL(jobUrl).pathname}"]`),
  ).toBeVisible();

  await gotoSignedIn(page, jobUrl);
  await page.getByRole("link", { name: "Tailor resume" }).click();
  await expect(page).toHaveURL(/\/en\/resumes\/new\?jobId=/);
  await page.getByRole("button", { name: "Generate proposal" }).click();
  const firstBullet = page
    .getByRole("textbox", { name: /^Achievement 1,/ })
    .first();
  await expect(firstBullet).toBeVisible({ timeout: 120_000 });

  // A user edit is kept; going back to the original restores the source text.
  await firstBullet.fill("Edited by the test");
  await page
    .getByRole("listitem")
    .filter({ has: firstBullet })
    .getByRole("button", { name: "Use original" })
    .click();
  await expect(firstBullet).not.toHaveValue("Edited by the test");

  await page.getByLabel("Version name").fill(versionName);
  await page.getByRole("button", { name: "Save resume version" }).click();
  await expect(page).toHaveURL(/\/en\/resumes\/[0-9a-f-]{36}$/);
  await expect(
    page.getByRole("heading", { level: 1, name: versionName }),
  ).toBeVisible();

  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download Word" }).click();
  expect((await download).suggestedFilename()).toBe(`${versionName}.docx`);

  // Editing a saved (unsent) version keeps the user's wording.
  await page.getByRole("link", { name: "Edit", exact: true }).click();
  await expect(page).toHaveURL(/\/en\/resumes\/[0-9a-f-]{36}\/edit$/);
  await page
    .getByRole("textbox", { name: /^Achievement 1,/ })
    .first()
    .fill("Reworded by the e2e test");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page).toHaveURL(/\/en\/resumes\/[0-9a-f-]{36}$/);
  await expect(page.getByText("Reworded by the e2e test")).toBeVisible();

  // Translating creates a new, linked version; the original is unchanged.
  const originalUrl = page.url();
  await page.getByRole("button", { name: "Translate to French" }).click();
  await expect(page.getByText(/^Translated from/)).toBeVisible({
    timeout: 120_000,
  });
  expect(page.url()).not.toBe(originalUrl);
  await expect(page.getByText("Resume in French")).toBeVisible();
  // A translation can't be rebuilt from the English profile, so no Edit.
  await expect(
    page.getByRole("link", { name: "Edit", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: versionName, exact: true }).click();
  await expect(page).toHaveURL(originalUrl);
  await expect(page.getByText("Reworded by the e2e test")).toBeVisible();

  // The application page: details, the resume sent, timeline and contacts.
  await gotoSignedIn(page, jobUrl);
  await page.getByRole("link", { name: "Open application" }).click();
  await expect(page).toHaveURL(/\/en\/tracker\/[0-9a-f-]{36}$/);
  const applicationUrl = page.url();
  await page.getByLabel("Next step", { exact: true }).fill("Phone screen");
  await page.getByLabel("Next step due").fill("2030-01-15");
  await page.getByRole("combobox", { name: "Resume sent" }).click();
  await page
    .getByRole("option", { name: new RegExp(`^${versionName} · English`) })
    .click();
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(page.getByText("Details saved.")).toBeVisible();
  await gotoSignedIn(page, applicationUrl);
  await expect(page.getByLabel("Next step", { exact: true })).toHaveValue(
    "Phone screen",
  );
  await expect(page.getByLabel("Next step due")).toHaveValue("2030-01-15");

  // Attaching the version locked it: no Edit, only Duplicate.
  await page.getByRole("link", { name: versionName, exact: true }).click();
  await expect(page.getByText("Sent with an application")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Edit", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Duplicate to edit" }),
  ).toBeVisible();

  await gotoSignedIn(page, applicationUrl);
  await page.getByLabel("Title").fill("Recruiter called");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(
    page.getByRole("listitem").filter({ hasText: "Recruiter called" }),
  ).toBeVisible();

  await page.getByLabel("Name", { exact: true }).fill("Sam Recruiter");
  await page.getByLabel("Email").fill("sam@example.com");
  await page.getByRole("button", { name: "Add contact" }).click();
  await expect(
    page.getByRole("link", { name: "sam@example.com" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Remove Sam Recruiter" }).click();
  await expect(page.getByRole("link", { name: "sam@example.com" })).toHaveCount(
    0,
  );

  // Clean up: stop tracking, then delete the job.
  await page.getByRole("button", { name: "Stop tracking" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Stop tracking" })
    .click();
  await expect(page).toHaveURL(/\/en\/tracker$/);
  // Older runs may have left cards with the same title; check this one.
  await expect(
    page.locator(`a[href="${new URL(applicationUrl).pathname}"]`),
  ).toHaveCount(0);

  await gotoSignedIn(page, jobUrl);
  await expect(
    page.getByRole("button", { name: "Track this job" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Delete job" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete job" })
    .click();
  await expect(page).toHaveURL(/\/en\/jobs$/);
  expect((await gotoSignedIn(page, jobUrl))?.status()).toBe(404);
});
