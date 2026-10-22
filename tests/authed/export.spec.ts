import { expect, test } from "@playwright/test";
import { gotoSignedIn } from "../support";

// Read-only. Needs the profile saved by profile.spec.ts.
test("downloads the master profile as PDF and Word", async ({ page }) => {
  await gotoSignedIn(page, "/en/profile");
  for (const [name, type, magic] of [
    ["PDF", "application/pdf", "%PDF-"],
    [
      "Word",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "PK",
    ],
  ] as const) {
    const link = page.getByRole("link", { name, exact: true });
    const response = await page.request.get((await link.getAttribute("href"))!);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toBe(type);
    expect(response.headers()["cache-control"]).toBe("private, no-store");
    expect(response.headers()["content-disposition"]).toMatch(/^attachment;/);
    expect((await response.body()).subarray(0, magic.length).toString()).toBe(
      magic,
    );
  }
});

test("rejects an unknown export format", async ({ page }) => {
  await gotoSignedIn(page, "/en/profile");
  const response = await page.request.get("/api/profile/export?format=exe");
  expect(response.status()).toBe(400);
});
