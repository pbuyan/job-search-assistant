import { expect, test } from "@playwright/test";
import { gotoSignedIn } from "../support";

// Full journey through the real AI pipeline (Claude + Voyage): slow and billed,
// so opt-in with E2E_AI=1. Needs the profile saved by profile.spec.ts. Each run
// leaves one job, one application and one resume version on the test user.
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

  await page.getByLabel("Version name").fill(`E2E ${jobTitle}`);
  await page.getByRole("button", { name: "Save resume version" }).click();
  await expect(page).toHaveURL(/\/en\/resumes\/[0-9a-f-]{36}$/);
  await expect(
    page.getByRole("heading", { level: 1, name: `E2E ${jobTitle}` }),
  ).toBeVisible();

  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download Word" }).click();
  expect((await download).suggestedFilename()).toBe(`E2E ${jobTitle}.docx`);

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
});
