import { defineConfig, devices, type Project } from "@playwright/test";
import dotenv from "dotenv";
import { AUTH_FILE } from "./tests/support";

// Same env as `pnpm dev`: Clerk keys, DATABASE_URL (Neon), AI keys.
dotenv.config({ path: ".env.local", quiet: true });

const PORT = Number(process.env.PORT ?? 3000);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

// Signed-in specs need a dedicated Clerk test user (see .env.example). Without
// one, only the signed-out specs run.
const authed: Project[] = process.env.E2E_CLERK_USER_EMAIL
  ? [
      {
        name: "authed-desktop",
        testDir: "./tests/authed",
        use: { ...devices["Desktop Chrome"], storageState: AUTH_FILE },
        dependencies: ["setup"],
      },
      {
        // Read-only specs only: the desktop project mutates the same user.
        name: "authed-mobile",
        testDir: "./tests/authed",
        testMatch: /navigation\.spec\.ts/,
        use: { ...devices["Pixel 5"], storageState: AUTH_FILE },
        dependencies: ["setup"],
      },
    ]
  : [];

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "html",
  // `next dev` compiles routes on first hit, so the first visit is slow.
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    trace: "on-first-retry",
    navigationTimeout: 45_000,
  },
  projects: [
    { name: "setup", testMatch: /global\.setup\.ts/ },
    {
      name: "public",
      testMatch: /public\/.*\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
    },
    {
      name: "public-mobile",
      testMatch: /public\/.*\.spec\.ts/,
      use: { ...devices["Pixel 5"] },
      dependencies: ["setup"],
    },
    ...authed,
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `pnpm dev --port ${PORT}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
});
