import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e-prod",
  timeout: 120_000,
  reporter: [["list"]],
  projects: [{ name: "mobile-chrome", use: { ...devices["Pixel 7"] } }],
});
