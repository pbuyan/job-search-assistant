import { expect, test } from "@playwright/test";

const protectedPaths = [
  "/dashboard",
  "/profile",
  "/jobs",
  "/jobs/new",
  "/jobs/boards",
  "/resumes",
  "/tracker",
];

test.describe("signed-out visitors", () => {
  for (const path of protectedPaths) {
    test(`are sent to sign-in from ${path}`, async ({ page }) => {
      await page.goto(`/en${path}`);
      const url = new URL(page.url());
      expect(url.pathname).toBe("/en/sign-in");
      expect(url.searchParams.get("redirect_url")).toBe(`/en${path}`);
    });
  }

  test("keep their locale when redirected", async ({ page }) => {
    await page.goto("/fr/tracker?view=all");
    const url = new URL(page.url());
    expect(url.pathname).toBe("/fr/sign-in");
    expect(url.searchParams.get("redirect_url")).toBe("/fr/tracker?view=all");
  });

  test("see the Clerk sign-in form", async ({ page }) => {
    await page.goto("/en/sign-in");
    await expect(page.getByLabel(/email/i).first()).toBeVisible();
  });

  // auth.protect() answers with a redirect or 401/404 depending on the
  // request; either way the handler must not run.
  test("can't reach API routes", async ({ request }) => {
    const responses = await Promise.all([
      request.post("/api/profile/parse-resume", { maxRedirects: 0 }),
      request.get("/api/profile/export?format=pdf", { maxRedirects: 0 }),
      request.get(
        "/api/resumes/00000000-0000-4000-8000-000000000000/export?format=pdf",
        { maxRedirects: 0 },
      ),
    ]);
    for (const response of responses) {
      expect(response.status()).toBeGreaterThanOrEqual(300);
      expect(response.status()).toBeLessThan(500);
      expect(response.headers()["content-type"] ?? "").not.toContain(
        "application/pdf",
      );
    }
  });
});
