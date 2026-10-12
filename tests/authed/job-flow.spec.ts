import { expect, test } from "@playwright/test";

// Full journey through the real AI pipeline (Claude + Voyage): slow and billed,
// so opt-in with E2E_AI=1. Needs the profile saved by profile.spec.ts. Each run
// leaves one job and one application on the test user.
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

test("pastes a posting, analyzes fit, and tracks it", async ({ page }) => {
  await page.goto("/en/jobs/new");
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
  await expect(page.getByText("Fit with your profile")).toBeVisible({
    timeout: 120_000,
  });

  await page.getByRole("button", { name: "Track this job" }).click();
  await expect(page.getByText("In your tracker: Saved.")).toBeVisible();

  await page.getByRole("link", { name: "Open tracker" }).click();
  await expect(page).toHaveURL(/\/en\/tracker$/);
  await expect(page.getByText(jobTitle).first()).toBeVisible();

  await page.goto("/en/jobs");
  await expect(page.locator(`a[href="${new URL(jobUrl).pathname}"]`)).toBeVisible();
});
