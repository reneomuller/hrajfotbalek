/**
 * Which database a test runner is allowed to touch.
 *
 * THE PROBLEM THIS SOLVES. `playwright.config.ts` used to read `.env.local` by
 * literal filename, and `.env.local` holds production credentials. The E2E
 * suite creates and destroys data for a living. So "point the suite at the dev
 * stack" and "overwrite the production credentials" were the same action, and
 * the only thing standing between a normal day and a suite deleting real
 * bookings was remembering which file was which.
 *
 * The rule is therefore mechanical rather than remembered: a test runner may
 * only talk to a LOCAL Supabase stack. Anything else throws before a single
 * test is collected, with a message that says what to do about it.
 *
 * The escape hatch (`ALLOW_REMOTE_TEST_DB`) exists because a hosted dev project
 * is a legitimate configuration — it was the option not taken (see
 * `PHASE2_ENVIRONMENT.md` §1). It has to be set deliberately, per invocation,
 * and it is never set anywhere in this repo.
 */

/** Hosts that can only be a stack running on this machine. */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "host.docker.internal"]);

/**
 * Parses a dotenv file's contents.
 *
 * Deliberately small: `KEY=value`, optional surrounding quotes stripped,
 * anything else ignored. It is not a dotenv implementation and does not want to
 * be — it reads files this repo writes.
 */
export function parseEnvFile(raw: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!match) continue;
    env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }
  return env;
}

/**
 * Whether a Supabase URL points at a stack running on this machine.
 *
 * A malformed URL is NOT local. That direction matters: the failure mode of
 * "unparseable, so probably fine" is a test suite against production.
 */
export function isLocalSupabaseUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return LOCAL_HOSTS.has(parsed.hostname);
}

export interface TestDatabaseGuardOptions {
  /** The invocation that is being guarded, named in the error message. */
  runner?: string;
  /** Set from `ALLOW_REMOTE_TEST_DB`; never set inside this repo. */
  allowRemote?: boolean;
}

/**
 * Throws unless `url` is a database a test runner may write to.
 *
 * Called at config time — before test collection — so the failure arrives as
 * "you pointed this at the wrong database" rather than as a spec failing
 * somewhere inside a helper.
 */
export function assertTestDatabaseUrl(
  url: string | undefined,
  { runner = "This test runner", allowRemote = false }: TestDatabaseGuardOptions = {},
): void {
  if (!url) {
    throw new Error(
      `${runner} has no NEXT_PUBLIC_SUPABASE_URL. Start the local stack with ` +
        `\`npx supabase start\` and put its URL and keys in .env.test.local.`,
    );
  }

  if (isLocalSupabaseUrl(url)) return;

  if (allowRemote) return;

  throw new Error(
    `${runner} refuses to run against ${url}.\n\n` +
      `Only a local Supabase stack is allowed: this suite creates and destroys ` +
      `data, and that URL is not on this machine. Production credentials live in ` +
      `.env.local and must stay there.\n\n` +
      `Fix: \`npx supabase start\`, then put the printed URL and keys in ` +
      `.env.test.local.\n` +
      `If you genuinely mean to target a remote dev project, set ` +
      `ALLOW_REMOTE_TEST_DB=1 for that one invocation.`,
  );
}

/** Reads `ALLOW_REMOTE_TEST_DB` from an environment bag. */
export function remoteAllowed(env: NodeJS.ProcessEnv | Record<string, string>): boolean {
  const raw = String(env.ALLOW_REMOTE_TEST_DB ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}
