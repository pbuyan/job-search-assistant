import { expect, test } from "@playwright/test";
import { hasHorizontalScroll, openNav } from "../support";

// Read-only: runs at desktop and mobile widths against the shared test user.

const pages = [
  { nav: "Profile", path: "/en/profile", heading: "Profile" },
  { nav: "Jobs", path: "/en/jobs", heading: "Jobs" },
  { nav: "Tracker", path: "/en/tracker", heading: "Tracker" },
  { nav: "Dashboard", path: "/en/dashboard", heading: "Dashboard" },
];

test("landing page links signed-in users to the dashboard", async ({ page }) => {
  await page.goto("/en");
  await page.getByRole("link", { name: "Go to dashboard" }).click();
  await expect(page).toHaveURL(/\/en\/dashboard$/);
});

test("sidebar navigates between every section", async ({ page }) => {
  await page.goto("/en/dashboard");
  for (const { nav, path, heading } of pages) {
    await openNav(page);
    await page.getByRole("link", { name: nav, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(
      page.getByRole("heading", { level: 1, name: heading, exact: true }),
    ).toBeVisible();
    expect(await hasHorizontalScroll(page)).toBe(false);
  }
});

test("app pages render in French", async ({ page }) => {
  const french = [
    { path: "/fr/dashboard", heading: "Tableau de bord" },
    { path: "/fr/profile", heading: "Profil" },
    { path: "/fr/jobs", heading: "Emplois" },
    { path: "/fr/tracker", heading: "Suivi" },
  ];
  for (const { path, heading } of french) {
    await page.goto(path);
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    await expect(
      page.getByRole("heading", { level: 1, name: heading, exact: true }),
    ).toBeVisible();
    expect(await hasHorizontalScroll(page)).toBe(false);
  }
});

test("tracker shows every status column", async ({ page }) => {
  await page.goto("/en/tracker");
  for (const status of ["Saved", "Applied", "Interviewing", "Offer", "Rejected"]) {
    await expect(page.getByText(status, { exact: true }).first()).toBeVisible();
  }
});

test("unknown job ids are a 404", async ({ page }) => {
  const notUuid = await page.goto("/en/jobs/not-a-uuid");
  expect(notUuid?.status()).toBe(404);
  const missing = await page.goto("/en/jobs/00000000-0000-4000-8000-000000000000");
  expect(missing?.status()).toBe(404);
});
