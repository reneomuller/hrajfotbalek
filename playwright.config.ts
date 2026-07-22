import { readFileSync } from "node:fs";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * E2E harness.
 *
 * The suite runs against the SEEDED DEV DATABASE with `EMAIL_DRY_RUN=on`.
 * Nothing here mocks Supabase: the specs assert the real RPCs, the real RLS
 * policies and the real cron routes, because those are precisely the things
 * whose failure modes a mock cannot reproduce. The one thing that is stubbed
 * out is outbound email, and only by the flag the product already ships with.
 *
 * Run:
 *   npm run seed          — once, to put the fixtures in place
 *   npm run test:e2e
 *
 * This is a mobile-first product, so the default project is a phone viewport.
 */

/**
 * `.env.local`, loaded here rather than assumed.
 *
 * Playwright does not read dotenv files, and the spec helpers need the
 * Supabase URL and keys in `process.env` before the first test file is even
 * imported. Failing at config time with a clear message beats failing inside a
 * helper with "supabaseUrl is required".
 */
function loadEnvLocal(): Record<string, string> {
  const file = path.resolve(process.cwd(), ".env.local");
  const env: Record<string, string> = {};

  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch {
    throw new Error(
      ".env.local not found. The E2E suite runs against the seeded dev " +
        "database and needs the same credentials the app uses.",
    );
  }

  for (const line of raw.split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!match) continue;
    const value = match[2].trim().replace(/^["']|["']$/g, "");
    env[match[1]] = value;
    // Do not clobber a value deliberately exported by the caller.
    process.env[match[1]] ??= value;
  }

  return env;
}

const envLocal = loadEnvLocal();

/**
 * Email stays dry-run for the whole suite, whatever `.env.local` says.
 *
 * The specs drive the cron routes, which fan out mail to every player on a
 * game. Inheriting a live-send configuration would send real email to the
 * fixture addresses on every run — and after the Phase 30 cutover, that
 * configuration is exactly what `.env.local` will hold.
 */
const webServerEnv = { ...envLocal, EMAIL_DRY_RUN: "on" };
process.env.EMAIL_DRY_RUN = "on";

export default defineConfig({
  testDir: "./e2e",
  // The concurrency specs deliberately race two requests against one another
  // and assert the resulting database state; other specs booking the same
  // fixture game at the same moment would make that state ambiguous. Files run
  // in sequence, tests within a file in sequence.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  timeout: 60_000,
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
    env: webServerEnv,
  },
});
