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
