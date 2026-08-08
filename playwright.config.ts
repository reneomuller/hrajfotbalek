import { readFileSync } from "node:fs";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";
import {
  assertTestDatabaseUrl,
  parseEnvFile,
  remoteAllowed,
} from "./lib/env/testDatabase";

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
 * Credentials, loaded here rather than assumed — and checked before use.
 *
 * Playwright does not read dotenv files, and the spec helpers need the
 * Supabase URL and keys in `process.env` before the first test file is even
 * imported. Failing at config time with a clear message beats failing inside a
 * helper with "supabaseUrl is required".
 *
 * WHICH FILE, AND WHY IT IS NOT `.env.local`. This suite creates and destroys
 * data. `.env.local` holds PRODUCTION credentials, because that is the file the
 * app and the ops scripts read. Preferring `.env.test.local` keeps the two
 * apart by name rather than by memory, and `assertTestDatabaseUrl` then refuses
 * anything that is not a stack on this machine — so a missing test file falls
 * back to `.env.local` and *stops*, rather than quietly running the suite
 * against real players.
 */
function loadTestEnv(): { env: Record<string, string>; source: string } {
  const candidates = [".env.test.local", ".env.local"];

  for (const candidate of candidates) {
    let raw: string;
    try {
      raw = readFileSync(path.resolve(process.cwd(), candidate), "utf8");
    } catch {
      continue;
    }

    const env = parseEnvFile(raw);
    for (const [key, value] of Object.entries(env)) {
      // Do not clobber a value deliberately exported by the caller.
      process.env[key] ??= value;
    }
    return { env, source: candidate };
  }

  throw new Error(
    `No environment file found (looked for ${candidates.join(", ")}). The E2E ` +
      `suite runs against a local Supabase stack: \`npx supabase start\`, then ` +
      `put the printed URL and keys in .env.test.local.`,
  );
}

const { env: envLocal, source: envSource } = loadTestEnv();

assertTestDatabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL, {
  runner: `The Playwright suite (credentials from ${envSource})`,
  allowRemote: remoteAllowed(process.env),
});

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

/**
 * …and then check that the forcing worked.
 *
 * Forcing a value and verifying it are different guarantees. The two lines
 * above are the force; they are also two lines that a later edit can reorder,
 * spell wrong, or drop while refactoring `webServerEnv`, and the result would
 * be a suite that mails real addresses on every run while looking exactly like
 * a suite that does not. Nothing downstream would complain: `isDryRun()` fails
 * toward silence, so the only observable difference is mail arriving.
 *
 * So the value is read back through the product's own predicate. Anything that
 * is not dry-run stops the harness here, at config time, with the offending
 * value named — rather than defaulting to safe and hoping.
 */
const EMAIL_OFF_VALUES = new Set(["off", "false", "0", "no"]);

function resolvesToDryRun(raw: string | undefined): boolean {
  const value = raw?.trim().toLowerCase();
  if (value === undefined || value === "") return true;
  return !EMAIL_OFF_VALUES.has(value);
}

/*
 * Check 1 — the environment file must SAY dry run, not merely be overridden
 * into it.
 *
 * This is the check that can actually fire. The forcing above makes the suite
 * safe whatever the file says, which is precisely the problem: a
 * non-production env file carrying `EMAIL_DRY_RUN=off` is a misconfiguration
 * that the override would hide indefinitely, until the day some other runner —
 * the seed script, an integration check, a manual `npm run dev` — reads the
 * same file without an override and mails the fixture addresses.
 *
 * Unset fails too, deliberately, and this is the one place in the codebase
 * where absence is not treated as dry run. Everywhere else the fail-safe
 * default is right: a missing setting should log rather than send. Here the
 * missing setting is evidence that the file was never written against the
 * contract, and the harness would rather say so than paper over it.
 */
const declared = envLocal.EMAIL_DRY_RUN;
if (declared === undefined || declared.trim() === "") {
  throw new Error(
    `${envSource} does not set EMAIL_DRY_RUN.\n\n` +
      `The E2E harness forces dry run regardless, so this is not an immediate ` +
      `danger — it is an unconfigured environment file, and the next runner to ` +
      `read it without an override will not be so lucky. Add EMAIL_DRY_RUN=on ` +
      `to ${envSource}; see .env.local.example.`,
  );
}
if (!resolvesToDryRun(declared)) {
  throw new Error(
    `${envSource} sets EMAIL_DRY_RUN=${declared} — a SENDING configuration in ` +
      `a non-production environment file.\n\n` +
      `The suite drives the cron routes, which fan mail out to every player on ` +
      `a game. The harness would have overridden this for its own server, but ` +
      `the file is wrong and every other runner that reads it is exposed. ` +
      `\`off\` belongs in exactly one file on one machine: the production ` +
      `.env.local.`,
  );
}

/*
 * Check 2 — and the forcing still has to have worked.
 *
 * Cheap, and it is a tripwire rather than a discovery: it fires only if the
 * two assignments above are edited into ineffectiveness. That is a real way
 * for this to break and a silent one, since `isDryRun()` fails toward silence
 * and the only observable symptom would be mail arriving.
 */
for (const [label, value] of [
  ["the Playwright process", process.env.EMAIL_DRY_RUN],
  ["the web server it starts", webServerEnv.EMAIL_DRY_RUN],
] as const) {
  if (!resolvesToDryRun(value)) {
    throw new Error(
      `EMAIL_DRY_RUN resolves to "${value}" for ${label} — that is a SENDING ` +
        `configuration.\n\n` +
        `The harness forces dry run and then verifies the force; this failure ` +
        `means the forcing in playwright.config.ts stopped taking effect. Fix ` +
        `that rather than setting EMAIL_DRY_RUN=on in your shell — the guard ` +
        `is what stands between a test run and mailing real people.`,
    );
  }
}

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
    /*
     * NEVER adopt a server this config did not start.
     *
     * `reuseExistingServer: !process.env.CI` meant that any `npm run dev`
     * already on :3000 was used as-is — including one started from
     * `.env.local`, i.e. pointed at PRODUCTION, while the specs wrote their
     * fixtures to the local stack. The result is not a clean failure: the specs
     * create a game locally, the browser asks production for it, and the page
     * says "that game does not exist" while the session cookies (minted against
     * a different project) read as signed out. Fourteen specs failed that way
     * before this line changed, and the mode is worse than the failure — the
     * same setup with a live session is a test suite operating on real data.
     *
     * Starting our own server every time costs a few seconds and makes the env
     * in `webServerEnv` authoritative. A port already in use now fails loudly,
     * which is the correct outcome: stop the stray server.
     */
    reuseExistingServer: false,
    timeout: 120_000,
    env: webServerEnv,
  },
});
