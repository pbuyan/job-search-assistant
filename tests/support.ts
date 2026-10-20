import { clerk } from "@clerk/testing/playwright";
import type { Page } from "@playwright/test";

// Gitignored (see .gitignore: /playwright/.auth/).
export const AUTH_FILE = "playwright/.auth/user.json";

// On narrow viewports the sidebar is an off-canvas sheet behind the trigger.
export async function openNav(page: Page) {
  const trigger = page.getByRole("button", { name: "Toggle sidebar" });
  if (page.viewportSize()!.width < 768) await trigger.click();
}

// The page must not scroll sideways; French labels should wrap, not overflow.
export async function hasHorizontalScroll(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
}

// Navigating away while clerk-js is still initializing can drop its
// dev-browser cookie, and the next request lands signed out. Signed-in specs
// navigate with this so Clerk has settled before the test moves on.
export async function gotoSignedIn(page: Page, path: string) {
  const response = await page.goto(path);
  await clerk.loaded({ page });
  return response;
}
