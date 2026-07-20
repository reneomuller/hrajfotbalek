import { defineConfig, devices } from "@playwright/test";

/**
 * E2E harness. No specs exist until Phase 28 — `npm run test:e2e` is defined
 * from Phase 1 so every later phase's TEST-* criterion has a script to invoke.
 *
 * This is a mobile-first product, so the default project is a phone viewport.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 7"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
