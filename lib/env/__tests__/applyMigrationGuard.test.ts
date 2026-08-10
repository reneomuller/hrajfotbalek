import { describe, expect, it } from "vitest";
import {
  assertMigrationTarget,
  describeHost,
  isLocalDatabaseUrl,
  parseArgs,
} from "@/scripts/apply-migration.mjs";

/**
 * The guard on `scripts/apply-migration.mjs`.
 *
 * WHY THIS TEST EXISTS, specifically: on 2026-08-10 that script applied a
 * migration to PRODUCTION while being run as a local validation step. It reads
 * `SUPABASE_DB_URL` from `.env.local`, which is the production credential file
 * by design, and it printed `APPLIED` without naming a host — so nothing in the
 * output contradicted the assumption that it was local.
 *
 * It lives beside `testDatabase.ts` rather than under `scripts/` because the
 * unit config excludes `scripts/**` — that exclusion is deliberate (the
 * `*.check.ts` files there need live credentials), and it would otherwise have
 * made the guard the one piece of logic in the repo that could not be tested.
 */

const LOCAL = "postgresql://postgres:pw@127.0.0.1:54322/postgres";
const REMOTE = "postgresql://postgres:pw@aws-0-eu-west-1.pooler.supabase.com:5432/postgres";

describe("isLocalDatabaseUrl", () => {
  it("accepts the hosts a stack on this machine can have", () => {
    for (const host of ["localhost", "127.0.0.1", "host.docker.internal"]) {
      expect(isLocalDatabaseUrl(`postgresql://u:p@${host}:5432/db`), host).toBe(true);
    }
  });

  it("rejects a hosted database", () => {
    expect(isLocalDatabaseUrl(REMOTE)).toBe(false);
  });

  it("treats an unparseable string as NOT local", () => {
    // The direction matters: "unparseable, so probably fine" is a migration
    // against production. Same call the Phase 0 guard makes.
    expect(isLocalDatabaseUrl("not a url")).toBe(false);
    expect(isLocalDatabaseUrl("")).toBe(false);
  });
});

describe("assertMigrationTarget", () => {
  it("lets a local database through without ceremony", () => {
    expect(() => assertMigrationTarget(LOCAL)).not.toThrow();
  });

  it("REFUSES a remote database by default — the 2026-08-10 failure", () => {
    expect(() => assertMigrationTarget(REMOTE)).toThrow(/Refusing to apply/);
  });

  it("names the host it refused, so the message is actionable", () => {
    expect(() => assertMigrationTarget(REMOTE)).toThrow(/pooler\.supabase\.com/);
  });

  it("allows a remote database only when --production was passed", () => {
    expect(() => assertMigrationTarget(REMOTE, { production: true })).not.toThrow();
  });

  it("refuses an unparseable target rather than assuming it is safe", () => {
    expect(() => assertMigrationTarget("garbage")).toThrow(/Refusing to apply/);
  });
});

describe("parseArgs", () => {
  it("finds --production in any position and keeps it out of the file list", () => {
    expect(parseArgs(["--production", "a.sql"])).toEqual({
      production: true,
      files: ["a.sql"],
    });
    expect(parseArgs(["a.sql", "--production", "b.sql"])).toEqual({
      production: true,
      files: ["a.sql", "b.sql"],
    });
  });

  it("defaults to refusing", () => {
    expect(parseArgs(["a.sql"])).toEqual({ production: false, files: ["a.sql"] });
  });

  it("is a FLAG, not an environment variable", () => {
    // Deliberate: a variable exported once in a shell outlives the intention
    // that set it, and the check that failed was the implicit one.
    expect(parseArgs([]).production).toBe(false);
  });
});

describe("describeHost", () => {
  it("names host and port and drops the credentials", () => {
    expect(describeHost(LOCAL)).toBe("127.0.0.1:54322");
    expect(describeHost(LOCAL)).not.toContain("pw");
  });

  it("says so rather than throwing on a malformed string", () => {
    expect(describeHost("nope")).toContain("unparseable");
  });
});
