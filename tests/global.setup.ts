import { clerk, clerkSetup } from "@clerk/testing/playwright";
import { expect, test as setup } from "@playwright/test";
import { AUTH_FILE } from "./support";

setup.describe.configure({ mode: "serial" });

// Fetches a Clerk testing token so automated browsers pass bot protection.
setup("clerk testing token", async () => {
  await clerkSetup();
});

setup("sign in test user", async ({ page }) => {
  const emailAddress = process.env.E2E_CLERK_USER_EMAIL;
  setup.skip(!emailAddress, "E2E_CLERK_USER_EMAIL is not set");

  await page.goto("/en");
  await clerk.signIn({ page, emailAddress: emailAddress! });
  // The sign-in page normally lands here; it creates the `users` row that
  // every user-owned table references.
  await page.goto("/en/auth/callback");
  await expect(page).toHaveURL(/\/(en|fr)\/dashboard$/);
  await page.context().storageState({ path: AUTH_FILE });
});
