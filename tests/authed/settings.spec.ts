import { expect, test } from "@playwright/test";
import { gotoSignedIn, hasHorizontalScroll } from "../support";

// Never confirms: the shared test user must survive. Only checks that the
// delete stays locked until the confirmation word is typed.
test("account deletion needs the confirmation word", async ({ page }) => {
  await gotoSignedIn(page, "/en/settings");
  await page.getByRole("button", { name: "Delete account" }).click();
  const dialog = page.getByRole("dialog");
  const confirm = dialog.getByRole("button", { name: "Delete permanently" });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel("Confirmation").fill("delet");
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel("Confirmation").fill("delete");
  await expect(confirm).toBeEnabled();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  expect(await hasHorizontalScroll(page)).toBe(false);
});

test("the French confirmation word is SUPPRIMER", async ({ page }) => {
  await gotoSignedIn(page, "/fr/settings");
  await page.getByRole("button", { name: "Supprimer le compte" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Confirmation").fill("DELETE");
  await expect(
    dialog.getByRole("button", { name: "Supprimer définitivement" }),
  ).toBeDisabled();
  await dialog.getByLabel("Confirmation").fill("supprimer");
  await expect(
    dialog.getByRole("button", { name: "Supprimer définitivement" }),
  ).toBeEnabled();
});
