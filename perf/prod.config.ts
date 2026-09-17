import { defineConfig, devices } from "@playwright/test";

/**
 * A config of its own, so `npm run test:e2e` cannot pick these up.
 *
 * There is no `webServer`: this drives the DEPLOYED site. `playwright.config.ts`
 * deliberately refuses to adopt a server it did not start, and the same instinct
 * applies here in reverse — nothing in this directory may ever be pointed at
 * localhost by accident, so the base URL comes from `PERF_BASE` or the
 * production alias and never from a `.env` file.
 */
export default defineConfig({
  testDir: ".",
  timeout: 180_000,
  reporter: [["list"]],
  projects: [{ name: "mobile-chrome", use: { ...devices["Pixel 7"] } }],
});
