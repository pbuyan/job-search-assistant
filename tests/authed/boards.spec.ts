import { expect, test } from "@playwright/test";
import { gotoSignedIn } from "../support";

// Lists Lever's public demo board and imports one posting through the real
// pipeline (Lever API, Claude, Voyage): billed and network-bound, so opt-in
// with E2E_AI=1 like the job flow. Deletes the imported job at the end.
test.skip(!process.env.E2E_AI, "set E2E_AI=1 to run the AI flow");
test.describe.configure({ timeout: 240_000 });

const BOARD = "https://jobs.lever.co/leverdemo";

test("lists a Lever board and imports a posting", async ({ page }) => {
  await gotoSignedIn(
    page,
    `/en/jobs/boards?url=${encodeURIComponent(BOARD)}&all=1`,
  );
  await expect(
    page.getByRole("heading", { level: 2, name: "leverdemo" }),
  ).toBeVisible();
  await expect(page.getByText("Lever", { exact: true })).toBeVisible();

  // Import the first posting that isn't already imported.
  const importButton = page.getByRole("button", { name: /^Import / }).first();
  const label = (await importButton.getAttribute("aria-label"))!;
  const title = label.replace(/^Import /, "");
  await importButton.click();
  const open = page.getByRole("link", { name: "Open job" });
  await expect(open).toBeVisible({ timeout: 120_000 });

  await open.click();
  await expect(page).toHaveURL(/\/en\/jobs\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);

  // Clean up.
  await page.getByRole("button", { name: "Delete job" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete job" })
    .click();
  await expect(page).toHaveURL(/\/en\/jobs$/);
});
