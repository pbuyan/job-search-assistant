import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: true,
    // Playwright owns ./tests (see playwright.config.ts); keep unit and e2e
    // runners from tripping over each other's spec files.
    exclude: ["**/node_modules/**", "**/dist/**", "**/.next/**", "**/tests/**"],
  },
});
