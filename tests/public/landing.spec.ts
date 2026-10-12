import { expect, test } from "@playwright/test";
import { hasHorizontalScroll } from "../support";

test.describe("landing page", () => {
  test("redirects the bare root to the default locale", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/en$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });

  test("shows the English landing with sign-in links", async ({ page }) => {
    await page.goto("/en");
    await expect(page).toHaveTitle("Job Search Assistant");
    await expect(
      page.getByRole("heading", { level: 1, name: "Find the right job, faster" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/en/sign-in",
    );
    await expect(page.getByRole("link", { name: "Sign up" })).toHaveAttribute(
      "href",
      "/en/sign-up",
    );
    expect(await hasHorizontalScroll(page)).toBe(false);
  });

  test("shows the French landing", async ({ page }) => {
    await page.goto("/fr");
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    await expect(page).toHaveTitle("Assistant de recherche d'emploi");
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Trouvez le bon emploi, plus vite",
      }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Se connecter" })).toHaveAttribute(
      "href",
      "/fr/sign-in",
    );
    expect(await hasHorizontalScroll(page)).toBe(false);
  });

  test("switches language from the landing page", async ({ page }) => {
    await page.goto("/en");
    await page.getByRole("combobox", { name: "Language" }).click();
    await page.getByRole("option", { name: "Français" }).click();
    await expect(page).toHaveURL(/\/fr$/);
    await expect(
      page.getByRole("heading", { name: "Trouvez le bon emploi, plus vite" }),
    ).toBeVisible();
  });

  // Unknown locales aren't public routes, so the proxy sends signed-out
  // visitors to sign-in before the locale layout can 404.
  test("does not serve an unsupported locale", async ({ page }) => {
    await page.goto("/de");
    expect(new URL(page.url()).pathname).toBe("/en/sign-in");
  });
});
