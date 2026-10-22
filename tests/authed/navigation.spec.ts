import { expect, test } from "@playwright/test";
import { gotoSignedIn, hasHorizontalScroll, openNav } from "../support";

// Read-only: runs at desktop and mobile widths against the shared test user.

const pages = [
  { nav: "Profile", path: "/en/profile", heading: "Profile" },
  { nav: "Jobs", path: "/en/jobs", heading: "Jobs" },
  { nav: "Resumes", path: "/en/resumes", heading: "Resumes" },
  { nav: "Tracker", path: "/en/tracker", heading: "Tracker" },
  { nav: "Settings", path: "/en/settings", heading: "Settings" },
  { nav: "Dashboard", path: "/en/dashboard", heading: "Dashboard" },
];

test("landing page links signed-in users to the dashboard", async ({
  page,
}) => {
  await gotoSignedIn(page, "/en");
  await page.getByRole("link", { name: "Go to dashboard" }).click();
  await expect(page).toHaveURL(/\/en\/dashboard$/);
});

test("sidebar navigates between every section", async ({ page }) => {
  await gotoSignedIn(page, "/en/dashboard");
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
    { path: "/fr/resumes", heading: "CV" },
    { path: "/fr/tracker", heading: "Suivi" },
    { path: "/fr/settings", heading: "Paramètres" },
  ];
  for (const { path, heading } of french) {
    await gotoSignedIn(page, path);
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    await expect(
      page.getByRole("heading", { level: 1, name: heading, exact: true }),
    ).toBeVisible();
    expect(await hasHorizontalScroll(page)).toBe(false);
  }
});

test("tracker shows every status column", async ({ page }) => {
  await gotoSignedIn(page, "/en/tracker");
  for (const status of [
    "Saved",
    "Applied",
    "Interviewing",
    "Offer",
    "Rejected",
  ]) {
    await expect(page.getByText(status, { exact: true }).first()).toBeVisible();
  }
});

test("unknown job ids are a 404", async ({ page }) => {
  const notUuid = await gotoSignedIn(page, "/en/jobs/not-a-uuid");
  expect(notUuid?.status()).toBe(404);
  const missing = await gotoSignedIn(
    page,
    "/en/jobs/00000000-0000-4000-8000-000000000000",
  );
  expect(missing?.status()).toBe(404);
  for (const path of [
    "/en/tracker/not-a-uuid",
    "/en/tracker/00000000-0000-4000-8000-000000000000",
  ]) {
    expect((await gotoSignedIn(page, path))?.status(), path).toBe(404);
  }
});

test("unknown resume and tailoring targets are a 404", async ({ page }) => {
  for (const path of [
    "/en/resumes/not-a-uuid",
    "/en/resumes/00000000-0000-4000-8000-000000000000",
    "/en/resumes/new",
    "/en/resumes/new?jobId=00000000-0000-4000-8000-000000000000",
  ]) {
    const response = await gotoSignedIn(page, path);
    expect(response?.status(), path).toBe(404);
  }
});
