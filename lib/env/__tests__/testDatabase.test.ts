import { describe, expect, it } from "vitest";
import {
  assertTestDatabaseUrl,
  isLocalSupabaseUrl,
  parseEnvFile,
  remoteAllowed,
} from "@/lib/env/testDatabase";

/**
 * The production guard, asserted here rather than by experiment.
 *
 * The other way to check that a destructive test runner refuses production is
 * to point it at production and watch, which is exactly the outcome the guard
 * exists to prevent.
 */

const PRODUCTION_URL = "https://abcdefghijklmnop.supabase.co";
const LOCAL_URL = "http://127.0.0.1:54321";

describe("isLocalSupabaseUrl", () => {
  it("accepts the hosts a local stack can be reached on", () => {
    expect(isLocalSupabaseUrl("http://localhost:54321")).toBe(true);
    expect(isLocalSupabaseUrl(LOCAL_URL)).toBe(true);
    expect(isLocalSupabaseUrl("http://host.docker.internal:54321")).toBe(true);
  });

  it("rejects a hosted Supabase project", () => {
    expect(isLocalSupabaseUrl(PRODUCTION_URL)).toBe(false);
  });

  it("rejects a host that merely contains a local name", () => {
    // The check is on the parsed hostname, not a substring: a real project
    // called `localhost-something` must not slip through.
    expect(isLocalSupabaseUrl("https://localhost.evil.example.com")).toBe(false);
    expect(isLocalSupabaseUrl("https://notlocalhost.supabase.co")).toBe(false);
  });

  it("treats an unparseable URL as NOT local", () => {
    // The dangerous default is "unparseable, so probably fine".
    expect(isLocalSupabaseUrl("not a url")).toBe(false);
    expect(isLocalSupabaseUrl("")).toBe(false);
  });
});

describe("assertTestDatabaseUrl", () => {
  it("passes a local stack", () => {
    expect(() => assertTestDatabaseUrl(LOCAL_URL)).not.toThrow();
  });

  it("throws on a production URL", () => {
    expect(() => assertTestDatabaseUrl(PRODUCTION_URL)).toThrow(/refuses to run against/);
  });

  it("names the runner and the offending URL, so the message is actionable", () => {
    expect(() => assertTestDatabaseUrl(PRODUCTION_URL, { runner: "Playwright" })).toThrow(
      /Playwright refuses to run against https:\/\/abcdefghijklmnop\.supabase\.co/,
    );
  });

  it("points at the fix rather than only at the problem", () => {
    expect(() => assertTestDatabaseUrl(PRODUCTION_URL)).toThrow(/npx supabase start/);
    expect(() => assertTestDatabaseUrl(PRODUCTION_URL)).toThrow(/\.env\.test\.local/);
  });

  it("throws when the URL is missing entirely", () => {
    expect(() => assertTestDatabaseUrl(undefined)).toThrow(/no NEXT_PUBLIC_SUPABASE_URL/);
  });

  it("allows a remote database only on an explicit opt-in", () => {
    expect(() => assertTestDatabaseUrl(PRODUCTION_URL, { allowRemote: true })).not.toThrow();
  });
});

describe("remoteAllowed", () => {
  it("recognises the affirmative spellings", () => {
    for (const value of ["1", "true", "TRUE", "yes"]) {
      expect(remoteAllowed({ ALLOW_REMOTE_TEST_DB: value })).toBe(true);
    }
  });

  it("defaults to refusing", () => {
    expect(remoteAllowed({})).toBe(false);
    expect(remoteAllowed({ ALLOW_REMOTE_TEST_DB: "" })).toBe(false);
    expect(remoteAllowed({ ALLOW_REMOTE_TEST_DB: "0" })).toBe(false);
    expect(remoteAllowed({ ALLOW_REMOTE_TEST_DB: "no" })).toBe(false);
  });
});

describe("parseEnvFile", () => {
  it("reads keys, trims and unquotes values", () => {
    const env = parseEnvFile(
      ['NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321', 'KEY="quoted"', "OTHER = spaced "].join(
        "\n",
      ),
    );
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe("http://127.0.0.1:54321");
    expect(env.KEY).toBe("quoted");
    expect(env.OTHER).toBe("spaced");
  });

  it("ignores comments and blank lines", () => {
    const env = parseEnvFile("# a comment\n\nA=1\n");
    expect(env).toEqual({ A: "1" });
  });
});
